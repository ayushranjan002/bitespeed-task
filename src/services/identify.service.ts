// src/services/identify.service.ts
import prisma from '../db';
import { Contact, LinkPrecedence } from '@prisma/client';
import { IdentifyRequestPayload, IdentifyResponse } from '../types/identify.types';

export const processIdentity = async (payload: IdentifyRequestPayload): Promise<IdentifyResponse> => {
  const { email, phoneNumber } = payload;

  const whereClauseParts: any[] = [];
  if (email) {
    whereClauseParts.push({ email: email });
  }
  if (phoneNumber) {
    whereClauseParts.push({ phoneNumber: phoneNumber });
  }

  if (whereClauseParts.length === 0) {
    throw new Error("Email or phone number must be provided to identify a contact.");
  }

  // Find all contacts that directly match the incoming email or phone number
  const TmatchingContactsFromPayload = await prisma.contact.findMany({
    where: {
      OR: whereClauseParts,
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Scenario 1: No existing contacts found by the provided email or phoneNumber
  if (TmatchingContactsFromPayload.length === 0) {
    const TnewPrimaryContact = await prisma.contact.create({
      data: {
        email: email,
        phoneNumber: phoneNumber,
        linkPrecedence: LinkPrecedence.primary,
      },
    });

    return {
      contact: {
        primaryContatctId: TnewPrimaryContact.id,
        emails: TnewPrimaryContact.email ? [TnewPrimaryContact.email] : [],
        phoneNumbers: TnewPrimaryContact.phoneNumber ? [TnewPrimaryContact.phoneNumber] : [],
        secondaryContactIds: [],
      },
    };
  }

  // Scenario 2: Existing contacts found
  // Determine all unique root primary contacts associated with the matching contacts
  let TallAssociatedContacts: Contact[] = [...TmatchingContactsFromPayload];
  const TrootPrimaryContactIds = new Set<number>();

  for (const Tcontact of TmatchingContactsFromPayload) {
    if (Tcontact.linkPrecedence === LinkPrecedence.primary) {
      TrootPrimaryContactIds.add(Tcontact.id);
    } else if (Tcontact.linkedId) {
      TrootPrimaryContactIds.add(Tcontact.linkedId); // Add the direct primary ID
      // To be absolutely sure, we could fetch all linked primaries recursively here if chains are deep
      // For now, this assumes the problem's structure (secondaries link to a primary)
      // Or, we find all contacts that link to these matching ones and then find their primaries.
    }
  }

  // Fetch all contacts that are either primary themselves (from the set) or are linked to one of these primaries.
  // This helps build the complete picture of all potentially involved identity groups.
  if (TrootPrimaryContactIds.size > 0) {
      const TrelatedContacts = await prisma.contact.findMany({
          where: {
              OR: [
                  { id: { in: Array.from(TrootPrimaryContactIds) } }, // The primaries themselves
                  { linkedId: { in: Array.from(TrootPrimaryContactIds) } } // Secondaries of these primaries
              ],
              deletedAt: null
          }
      });
      // Add these to our working set of all associated contacts, avoiding duplicates
      TrelatedContacts.forEach(rc => {
          if (!TallAssociatedContacts.find(ac => ac.id === rc.id)) {
              TallAssociatedContacts.push(rc);
          }
      });
  }


  // Identify all unique "primary" contacts from the broader set of associated contacts
  const TdistinctPrimaryContactsInvolved = TallAssociatedContacts
    .filter(c => c.linkPrecedence === LinkPrecedence.primary)
    .filter((contact, index, self) => index === self.findIndex(c => c.id === contact.id)) // Unique
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); // Oldest first


  let TtruePrimaryContact: Contact;
  let TcontactsToUpdate: Contact[] = []; // Contacts that need to change their primary

  if (TdistinctPrimaryContactsInvolved.length === 0 && TallAssociatedContacts.length > 0) {
    // This means all associated contacts are secondary, but their primary wasn't fetched directly.
    // This can happen if the initial payload only matched a secondary, and its primary wasn't in initial results.
    // We need to find the primary for the oldest associated contact.
    // This part needs careful re-evaluation or ensure TallAssociatedContacts includes all true primaries.
    // For now, let's assume the previous `rootPrimaryContactIds` logic caught the relevant primaries.
    // If not, we'd have to trace linkedId up from the oldest of `TallAssociatedContacts`.
    // Let's simplify: if distinctPrimaryContactsInvolved is empty, means our initial logic missed something
    // or we only found secondaries whose primaries are not in TallAssociatedContacts
    // This should be handled by ensuring all relevant primaries are fetched.
    // For simplicity, we'll assume `TdistinctPrimaryContactsInvolved` will have the primary.
    // If `TmatchingContactsFromPayload` found contacts, at least one primary (or link to one) should emerge.
    console.warn("No distinct primary contacts identified, but associated contacts exist. Review logic or data.");
    // Fallback: pick the oldest contact overall from TallAssociatedContacts and treat it as primary or find its primary
    TallAssociatedContacts.sort((a,b) => a.createdAt.getTime() - b.createdAt.getTime());
    let TfallbackCandidate = TallAssociatedContacts[0];
    if (TfallbackCandidate.linkedId) {
        const Tparent = await prisma.contact.findUnique({where: {id: TfallbackCandidate.linkedId}});
        TtruePrimaryContact = Tparent || TfallbackCandidate; // if parent not found, use the secondary itself
    } else {
        TtruePrimaryContact = TfallbackCandidate;
    }
  } else {
    TtruePrimaryContact = TdistinctPrimaryContactsInvolved[0]; // The oldest primary is the true one

    if (TdistinctPrimaryContactsInvolved.length > 1) {
      // MERGE SCENARIO: More than one primary contact group is being linked.
      // The truePrimaryContact is the oldest. All others become secondary to it.
      for (let Ti = 1; Ti < TdistinctPrimaryContactsInvolved.length; Ti++) {
        const TprimaryToDemote = TdistinctPrimaryContactsInvolved[Ti];
        TcontactsToUpdate.push(TprimaryToDemote); // This primary will become secondary

        // Find all secondaries of the primaryToDemote and also mark them for update
        const TsecondariesOfDemotedPrimary = TallAssociatedContacts.filter(
          c => c.linkedId === TprimaryToDemote.id
        );
        TcontactsToUpdate.push(...TsecondariesOfDemotedPrimary);
      }

      // Perform the updates in a transaction
      if (TcontactsToUpdate.length > 0) {
        await prisma.$transaction(
          TcontactsToUpdate.map(contactToUpdate =>
            prisma.contact.update({
              where: { id: contactToUpdate.id },
              data: {
                linkedId: TtruePrimaryContact.id,
                linkPrecedence: LinkPrecedence.secondary,
                updatedAt: new Date(), // Explicitly set updatedAt
              },
            })
          )
        );
        console.log(`Merged ${TcontactsToUpdate.length} contacts to primary ID ${TtruePrimaryContact.id}`);
        // Refresh TallAssociatedContacts to reflect these changes for response generation
        TallAssociatedContacts.forEach(c => {
            if (TcontactsToUpdate.find(u => u.id === c.id)) {
                c.linkedId = TtruePrimaryContact.id;
                c.linkPrecedence = LinkPrecedence.secondary;
            }
        });
      }
    }
  }


  // --- Create new secondary contact if payload introduces new info ---
  // This logic assumes truePrimaryContact is now correctly established.
  let TnewSecondaryContact: Contact | null = null;
  const TrequestEmailProvided = typeof email === 'string';
  const TrequestPhoneProvided = typeof phoneNumber === 'string';

  // Check against all current contacts in the now-unified group
  const TcurrentGroupContactsForInfoCheck = await prisma.contact.findMany({
    where: {
        OR: [
            { id: TtruePrimaryContact.id },
            { linkedId: TtruePrimaryContact.id }
        ],
        deletedAt: null
    }
  });


  const TexactPayloadMatchExistsInGroup = TcurrentGroupContactsForInfoCheck.some(c => {
      const TemailMatch = !TrequestEmailProvided || c.email === email;
      const TphoneMatch = !TrequestPhoneProvided || c.phoneNumber === phoneNumber;
      // Both must be true for an exact match of provided fields.
      // If email is not provided in payload, emailMatch is true. Same for phone.
      // If both provided, both must match.
      if (TrequestEmailProvided && TrequestPhoneProvided) return c.email === email && c.phoneNumber === phoneNumber;
      if (TrequestEmailProvided) return c.email === email;
      if (TrequestPhoneProvided) return c.phoneNumber === phoneNumber;
      return false; // Should not happen if controller validates payload
  });


  if (!TexactPayloadMatchExistsInGroup && (TrequestEmailProvided || TrequestPhoneProvided)) {
    TnewSecondaryContact = await prisma.contact.create({
      data: {
        email: email,
        phoneNumber: phoneNumber,
        linkedId: TtruePrimaryContact.id,
        linkPrecedence: LinkPrecedence.secondary,
      },
    });
    console.log("Created new secondary contact due to new info:", TnewSecondaryContact);
    TallAssociatedContacts.push(TnewSecondaryContact); // Add to list for response
  }
  // --- End create new secondary contact ---

  // Final gathering of all info for the response
  const TfinalCollectedEmails = new Set<string>();
  const TfinalCollectedPhoneNumbers = new Set<string>();
  const TfinalSecondaryContactIds: number[] = [];

  // Re-fetch ALL contacts associated with the truePrimaryContact post-merge/creation
  const TfinalGroupMembers = await prisma.contact.findMany({
      where: {
          OR: [
              {id: TtruePrimaryContact.id},
              {linkedId: TtruePrimaryContact.id}
          ],
          deletedAt: null
      },
      orderBy: [
          {linkPrecedence: 'asc'},
          {createdAt: 'asc'}
      ]
  });


  if (TtruePrimaryContact.email) TfinalCollectedEmails.add(TtruePrimaryContact.email);
  if (TtruePrimaryContact.phoneNumber) TfinalCollectedPhoneNumbers.add(TtruePrimaryContact.phoneNumber);

  TfinalGroupMembers.forEach(contact => {
    if (contact.email) TfinalCollectedEmails.add(contact.email);
    if (contact.phoneNumber) TfinalCollectedPhoneNumbers.add(contact.phoneNumber);
    if (contact.id !== TtruePrimaryContact.id) {
      TfinalSecondaryContactIds.push(contact.id);
    }
  });

  const TresponseEmails = [
    ...(TtruePrimaryContact.email ? [TtruePrimaryContact.email] : []),
    ...Array.from(TfinalCollectedEmails).filter(e => e !== TtruePrimaryContact.email)
  ];
  const TresponsePhoneNumbers = [
    ...(TtruePrimaryContact.phoneNumber ? [TtruePrimaryContact.phoneNumber] : []),
    ...Array.from(TfinalCollectedPhoneNumbers).filter(p => p !== TtruePrimaryContact.phoneNumber)
  ];

  return {
    contact: {
      primaryContatctId: TtruePrimaryContact.id,
      emails: TresponseEmails,
      phoneNumbers: TresponsePhoneNumbers,
      secondaryContactIds: TfinalSecondaryContactIds.sort((a,b) => a-b),
    },
  };
};