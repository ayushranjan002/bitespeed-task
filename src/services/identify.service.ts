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
    // This case should be prevented by controller validation
    throw new Error("Email or phone number must be provided to identify a contact.");
  }

  const matchingContactsFromPayload = await prisma.contact.findMany({
    where: {
      OR: whereClauseParts,
      deletedAt: null, // Optional: if you implement soft deletes
    },
    orderBy: {
      createdAt: 'asc', // Oldest first, important for determining the ultimate primary
    },
  });

  // Scenario 1: No existing contacts found by the provided email or phoneNumber
  if (matchingContactsFromPayload.length === 0) {
    // Create a new primary contact
    const newPrimaryContact = await prisma.contact.create({
      data: {
        email: email, // Will be null if not provided
        phoneNumber: phoneNumber, // Will be null if not provided
        linkPrecedence: LinkPrecedence.primary,
        // linkedId will be null by default for a new primary contact
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

  // Scenario 2: Existing contacts found
  // We need to determine the true primary contact for this set of matching contacts.
  // This involves looking at their linkPrecedence and linkedId.

  let potentialPrimaryContacts: Contact[] = [];
  for (const contact of matchingContactsFromPayload) {
    if (contact.linkPrecedence === LinkPrecedence.primary) {
      potentialPrimaryContacts.push(contact);
    } else if (contact.linkedId) {
      // It's a secondary, find its ultimate primary by traversing up if necessary
      // For now, we assume direct link or one level up for simplicity of this step.
      // A more robust solution would loop until linkedId is null.
      let current = contact;
      let visited = new Set<number>(); // To prevent infinite loops in malformed data
      while(current.linkedId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = await prisma.contact.findUnique({ where: { id: current.linkedId }});
        if (parent) {
            current = parent;
        } else {
            break; // Should not happen with clean data
        }
      }
      potentialPrimaryContacts.push(current); // Add the found primary (or oldest secondary if chain broke)
    }
  }

  // Deduplicate potential primary contacts by ID and sort them by creation date (oldest first)
  const uniquePotentialPrimaries = potentialPrimaryContacts
    .filter((contact, index, self) => index === self.findIndex((c) => c.id === contact.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let truePrimaryContact: Contact;

  if (uniquePotentialPrimaries.length > 0) {
    truePrimaryContact = uniquePotentialPrimaries[0]; // The oldest among them is the true primary
    // TODO LATER: If uniquePotentialPrimaries.length > 1, it means we found multiple distinct "primary" trees
    // that are now linked by the incoming request. We will need to merge them by updating
    // the newer primary(s) to become secondary to truePrimaryContact.
  } else {
    // This case should ideally not be reached if data is consistent and matchingContactsFromPayload is not empty.
    // It implies that all matching contacts were secondary but their primary couldn't be found (orphaned data).
    // As a fallback, pick the oldest contact from the initial matches.
    console.warn("Could not definitively determine a primary contact from linked IDs; using the oldest matched contact as a fallback. Data may need review.");
    truePrimaryContact = matchingContactsFromPayload[0]; // Fallback to the oldest of the initial matches
  }

  // Now, gather all contacts belonging to this truePrimaryContact's identity group.
  // This includes the primary itself and all secondaries that are linked (directly or indirectly) to it.
  // For this step, we'll get the primary and its direct secondaries.
  // A full traversal might be needed if secondaries can link to other secondaries.
  // The task examples imply secondaries link directly to a primary.

  const allContactsInGroup = await prisma.contact.findMany({
    where: {
      OR: [
        { id: truePrimaryContact.id },
        { linkedId: truePrimaryContact.id }
      ],
      deletedAt: null,
    },
    orderBy: [ // <--- FIX: Change to an array of objects
      { linkPrecedence: 'asc' },
      { createdAt: 'asc' }
    ],
  });


  const collectedEmails = new Set<string>();
  const collectedPhoneNumbers = new Set<string>();
  const collectedSecondaryContactIds: number[] = [];

  // Ensure the true primary's details are added first if they exist
  if (truePrimaryContact.email) {
    collectedEmails.add(truePrimaryContact.email);
  }
  if (truePrimaryContact.phoneNumber) {
    collectedPhoneNumbers.add(truePrimaryContact.phoneNumber);
  }

  for (const contact of allContactsInGroup) {
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

  // TODO LATER: Implement logic to check if the incoming payload (payload.email, payload.phoneNumber)
  // introduces new information (a new email or phone number not in collectedEmails/collectedPhoneNumbers,
  // or if the exact pair of (payload.email, payload.phoneNumber) doesn't exist as a contact row yet for this group).
  // If new info is present, create a new "secondary" contact linked to `truePrimaryContact`.

  // TODO LATER: Implement the actual merging logic. If `uniquePotentialPrimaries.length > 1`,
  // all primary contacts in `uniquePotentialPrimaries` except `truePrimaryContact` (and all their secondaries)
  // need to be updated to become secondary to `truePrimaryContact`.

  // Construct the response arrays ensuring primary's info is first
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
      secondaryContactIds: collectedSecondaryContactIds.sort((a, b) => a - b), // Sort for consistency
    },
  };
};