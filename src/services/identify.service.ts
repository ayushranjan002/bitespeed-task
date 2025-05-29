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

  const matchingContactsFromPayload = await prisma.contact.findMany({
    where: {
      OR: whereClauseParts,
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (matchingContactsFromPayload.length === 0) {
    const newPrimaryContact = await prisma.contact.create({
      data: {
        email: email,
        phoneNumber: phoneNumber,
        linkPrecedence: LinkPrecedence.primary,
      },
    });

    return {
      contact: {
        primaryContatctId: newPrimaryContact.id,
        emails: newPrimaryContact.email ? [newPrimaryContact.email] : [],
        phoneNumbers: newPrimaryContact.phoneNumber ? [newPrimaryContact.phoneNumber] : [],
        secondaryContactIds: [],
      },
    };
  }

  let potentialPrimaryContacts: Contact[] = [];
  for (const contact of matchingContactsFromPayload) {
    if (contact.linkPrecedence === LinkPrecedence.primary) {
      potentialPrimaryContacts.push(contact);
    } else if (contact.linkedId) {
      let current = contact;
      let visited = new Set<number>();
      while(current.linkedId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = await prisma.contact.findUnique({ where: { id: current.linkedId }});
        if (parent) {
            current = parent;
        } else {
            break; 
        }
      }
      potentialPrimaryContacts.push(current);
    }
  }

  const uniquePotentialPrimaries = potentialPrimaryContacts
    .filter((contact, index, self) => index === self.findIndex((c) => c.id === contact.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let truePrimaryContact: Contact;

  if (uniquePotentialPrimaries.length > 0) {
    truePrimaryContact = uniquePotentialPrimaries[0];
  } else {
    console.warn("Could not definitively determine a primary contact from linked IDs; using the oldest matched contact as a fallback. Data may need review.");
    truePrimaryContact = matchingContactsFromPayload[0];
  }

  // --- START: LOGIC FOR CREATING NEW SECONDARY CONTACT IF NEEDED ---
  let newSecondaryContactCreated = false;
  let newSecondaryContact: Contact | null = null;

  // Check if the exact combination of incoming email and phone already exists for this primary group
  // or if the incoming info is entirely new to the group.
  const requestEmailProvided = typeof email === 'string';
  const requestPhoneProvided = typeof phoneNumber === 'string';

  let isNewInformationPresent = false;

  // Gather all current emails and phone numbers for the identified primary group
  const currentGroupEmails = new Set<string>();
  const currentGroupPhoneNumbers = new Set<string>();
  const contactsForInfoCheck = await prisma.contact.findMany({ // Re-fetch to be sure, or use allContactsInGroup if comprehensive
    where: {
        OR: [
            { id: truePrimaryContact.id },
            { linkedId: truePrimaryContact.id }
        ],
        deletedAt: null
    }
  });
  contactsForInfoCheck.forEach(c => {
    if (c.email) currentGroupEmails.add(c.email);
    if (c.phoneNumber) currentGroupPhoneNumbers.add(c.phoneNumber);
  });


  // Condition 1: Is the incoming email new to the group?
  if (requestEmailProvided && !currentGroupEmails.has(email!)) {
    isNewInformationPresent = true;
  }
  // Condition 2: Is the incoming phone number new to the group?
  if (requestPhoneProvided && !currentGroupPhoneNumbers.has(phoneNumber!)) {
    isNewInformationPresent = true;
  }
  
  // Condition 3: If both email and phone are provided in the request,
  // does this specific *pair* already exist as a contact row for this group?
  // This handles cases where email is known, phone is known, but not together in one row.
  // However, the problem statement implies a new row if *either* is common but contains *new information*.
  // The examples suggest that if (email_A, phone_A) is primary, and request is (email_B, phone_A),
  // a new secondary (email_B, phone_A) is created. This is covered by isNewInformationPresent already.
  // A stricter check could be:
  // if (requestEmailProvided && requestPhoneProvided) {
  //   const exactMatchExists = contactsForInfoCheck.some(c => c.email === email && c.phoneNumber === phoneNumber);
  //   if (!exactMatchExists) isNewInformationPresent = true; // Or a more specific flag
  // }

  // If there's new information (new email, new phone, or a new combination of existing ones not yet a row)
  // AND if at least one piece of info (email or phone) from the request matches *some* contact that led us to this primary.
  // The second part is implicitly true because `matchingContactsFromPayload` was not empty.
  
  // Create a new secondary contact if:
  // 1. The request contains an email not yet in the group OR
  // 2. The request contains a phone number not yet in the group.
  // (This simplification covers the examples where a new piece of info leads to a secondary)
  
  // A simpler check based on problem's example: if the incoming request's (email, phone) combo doesn't perfectly match an existing row for this group,
  // and at least one part of it (email or phone) links to the group, create secondary.
  // More directly: if the incoming data isn't fully redundant for this group.
  
  // Does the *exact* combination of (payload.email, payload.phoneNumber) exist as a row linked to this primaryContact?
  // Let's refine `isNewInformationPresent`:
  // We create a new secondary if the *specific combination* from the payload isn't already perfectly represented
  // by an existing contact row within the identified group.
  const exactPayloadMatchExistsInGroup = contactsForInfoCheck.some(c => {
      const emailMatch = !requestEmailProvided || c.email === email; // True if request.email is null OR emails match
      const phoneMatch = !requestPhoneProvided || c.phoneNumber === phoneNumber; // True if request.phone is null OR phones match
      return emailMatch && phoneMatch;
  });

  if (!exactPayloadMatchExistsInGroup) {
      // If the exact payload doesn't exist as a row, and at least one part of it matches the group
      // (which is true, otherwise we wouldn't be in this `else` block of `matchingContactsFromPayload.length > 0`),
      // then we create a new secondary contact.
      isNewInformationPresent = true; // Re-evaluating this based on the exact pair
  }


  if (isNewInformationPresent && (requestEmailProvided || requestPhoneProvided)) { // Ensure there's something to save
    newSecondaryContact = await prisma.contact.create({
      data: {
        email: email,
        phoneNumber: phoneNumber,
        linkedId: truePrimaryContact.id,
        linkPrecedence: LinkPrecedence.secondary,
      },
    });
    newSecondaryContactCreated = true;
    console.log("Created new secondary contact:", newSecondaryContact);
  }
  // --- END: LOGIC FOR CREATING NEW SECONDARY CONTACT ---


  // Re-gather all contacts in the group if a new secondary was created
  const finalContactsInGroup = newSecondaryContactCreated && newSecondaryContact
    ? [...contactsForInfoCheck, newSecondaryContact] // Add the new contact to the list for response generation
    : contactsForInfoCheck; // Use the previously fetched list

  const collectedEmails = new Set<string>();
  const collectedPhoneNumbers = new Set<string>();
  const collectedSecondaryContactIds: number[] = [];

  if (truePrimaryContact.email) {
    collectedEmails.add(truePrimaryContact.email);
  }
  if (truePrimaryContact.phoneNumber) {
    collectedPhoneNumbers.add(truePrimaryContact.phoneNumber);
  }

  for (const contact of finalContactsInGroup) {
    if (contact.email) {
      collectedEmails.add(contact.email);
    }
    if (contact.phoneNumber) {
      collectedPhoneNumbers.add(contact.phoneNumber);
    }
    if (contact.id !== truePrimaryContact.id) {
      collectedSecondaryContactIds.push(contact.id);
    }
  }
  
  // TODO LATER: Implement the actual merging logic. If `uniquePotentialPrimaries.length > 1`,
  // all primary contacts in `uniquePotentialPrimaries` except `truePrimaryContact` (and all their secondaries)
  // need to be updated to become secondary to `truePrimaryContact`.

  const finalEmails = [
    ...(truePrimaryContact.email ? [truePrimaryContact.email] : []),
    ...Array.from(collectedEmails).filter(e => e !== truePrimaryContact.email)
  ];
  const finalPhoneNumbers = [
    ...(truePrimaryContact.phoneNumber ? [truePrimaryContact.phoneNumber] : []),
    ...Array.from(collectedPhoneNumbers).filter(p => p !== truePrimaryContact.phoneNumber)
  ];

  return {
    contact: {
      primaryContatctId: truePrimaryContact.id,
      emails: finalEmails,
      phoneNumbers: finalPhoneNumbers,
      secondaryContactIds: collectedSecondaryContactIds.sort((a, b) => a - b),
    },
  };
};