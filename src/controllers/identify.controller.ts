// src/controllers/identify.controller.ts
import { Request, Response } from 'express';
import { IdentifyRequestPayload, IdentifyResponse } from '../types/identify.types';
import { processIdentity } from '../services/identify.service'; // Ensure this is correctly imported

export const handleIdentifyRequest = async (req: Request, res: Response): Promise<void> => {
  const payload = req.body as IdentifyRequestPayload;

  // Basic validation: Ensure at least email or phoneNumber is provided
  if (!payload.email && !payload.phoneNumber) {
    res.status(400).json({ error: 'Either email or phoneNumber must be provided.' });
    return;
  }

  try {
    const result: IdentifyResponse = await processIdentity(payload); // Call the service function
    res.status(200).json(result); // Send the result from the service

  } catch (error) {
    console.error('Error processing /identify request:', error);
    // Send a more specific error message if available
    if (error instanceof Error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    } else {
        res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};