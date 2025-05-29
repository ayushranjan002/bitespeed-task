// src/types/identify.types.ts

// From the task spec:
// Request:
// {
//  "email"?: string,
//  "phoneNumber"?: number // DB schema has String?, let's use string for consistency
// }
export interface IdentifyRequestPayload {
    email?: string | null;       // Making it explicitly possibly null
    phoneNumber?: string | null; // Using string as per DB and safer for phone numbers
  }
  
  // Response:
  // {
  //  "contact":{
  //      "primaryContatctId": number, // Typo in spec: "ContatctId"
  //      "emails": string[],
  //      "phoneNumbers": string[],
  //      "secondaryContactIds": number[]
  //  }
  // }
  export interface IdentifyResponse {
    contact: {
      primaryContatctId: number; // Sticking to spec's "ContatctId"
      emails: string[];          // first element being email of primary contact
      phoneNumbers: string[];    // first element being phoneNumber of primary contact
      secondaryContactIds: number[];
    };
  }