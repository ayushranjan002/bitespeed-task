// src/services/identify.service.ts
import prisma from '../db';
import { Contact, LinkPrecedence } from '@prisma/client'; // Prisma generated types
import { IdentifyRequestPayload, IdentifyResponse } from '../types/identify.types';

export const processIdentity = async (payload: IdentifyRequestPayload): Promise<IdentifyResponse> => {
  const { email, phoneNumber } = payload;

  // --- Step 1: Find existing contacts ---
  // Build the WHERE clause for the query carefully to handle nulls
  const whereClauseParts: any[] = [];
  if (email) {
    whereClauseParts.push({ email: email });
  }
  if (phoneNumber) {
    whereClauseParts.push({ phoneNumber: phoneNumber });
  }

  // This validation should ideally be in the controller, but as a safeguard:
  if (whereClauseParts.length === 0) {
    throw new Error("Email or phone number must be provided.");
  }

  const existingContacts = await prisma.contact.findMany({
    where: {
      OR: whereClauseParts,
      deletedAt: null, // Assuming we don't want to match soft-deleted contacts
    },
    orderBy: {
      createdAt: 'asc', // Oldest first
    },
  });

  // --- Step 2: Handle Scenarios ---

  // Scenario 1: No existing contacts found by the provided email or phoneNumber
  if (existingContacts.length === 0) {
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

  // --- SCENARIOS FOR EXISTING CONTACTS WILL GO HERE (NEXT STEPS) ---
  // For now, if contacts exist, let's return a placeholder indicating that.
  // This will be replaced with more complex logic.
  console.log("Existing contacts found:", existingContacts);

  // THIS IS A VERY TEMPORARY AND INCOMPLETE LOGIC FOR WHEN CONTACTS ARE FOUND.
  // IT WILL BE REPLACED ENTIRELY IN THE NEXT STEPS.
  // For now, just return the details of all found contacts to see them.
  // The "primaryContatctId" below is not yet correctly determined.

  const allEmails = new Set<string>();
  const allPhoneNumbers = new Set<string>();
  let determinedPrimaryContactId = existingContacts[0].id; // Default to first found, will be refined
  const secondaryContactIds: number[] = [];

  // Try to find an existing primary contact among the matches
  const primaryAmongExisting = existingContacts.find(c => c.linkPrecedence === LinkPrecedence.primary);
  if (primaryAmongExisting) {
    determinedPrimaryContactId = primaryAmongExisting.id;
  } else if (existingContacts[0].linkedId) {
    // If the first one is secondary, try to find its primary
    const parentOfFirst = await prisma.contact.findUnique({ where: { id: existingContacts[0].linkedId } });
    if (parentOfFirst) {
        determinedPrimaryContactId = parentOfFirst.id;
        // Add parent's details too for the temporary response
        if (parentOfFirst.email) allEmails.add(parentOfFirst.email);
        if (parentOfFirst.phoneNumber) allPhoneNumbers.add(parentOfFirst.phoneNumber);
    }
  }


  existingContacts.forEach(contact => {
    if (contact.email) allEmails.add(contact.email);
    if (contact.phoneNumber) allPhoneNumbers.add(contact.phoneNumber);
    if (contact.id !== determinedPrimaryContactId) { // Simple temporary logic
        if(contact.linkPrecedence === LinkPrecedence.secondary || !primaryAmongExisting)
      secondaryContactIds.push(contact.id);
    }
  });


  return {
    contact: {
      primaryContatctId: determinedPrimaryContactId,
      emails: Array.from(allEmails),
      phoneNumbers: Array.from(allPhoneNumbers),
      secondaryContactIds: secondaryContactIds.sort((a,b)=> a-b),
    },
  };
};