# Bitespeed Task Project

OBJECTIVE:
This project is a backend service for Bitespeed identity reconciliation task. It provides an API endpoint to identify and consolidate customer contact information across multiple interactions. 

## Hosted Endpoint

The `/identify` endpoint is deployed and accessible at:

https://bitespeed-task-ayushranjan.onrender.com/identify



## Overview

When customers interact with a platform using different emails or phone numbers, this service helps link these interactions to a single, consolidated identity. The system maintains `Contact` records, where the oldest contact in a group is "primary" and others are "secondary."

The core functionality is exposed via an HTTP POST request to the `/identify` endpoint.

## Tech Stack

*   **Runtime:** Node.js
*   **Language:** TypeScript
*   **Framework:** Express.js
*   **Database:** MySQL
*   **ORM:** Prisma

## Core Features

*   Processes incoming `email` and/or `phoneNumber`.
*   Creates new "primary" contacts for new customers.
*   Creates "secondary" contacts when new information is added to an existing identity.
*   Merges two distinct primary identities if a request links them, with the older contact becoming the true primary.
*   Returns a consolidated contact view:
    *   `primaryContatctId`
    *   `emails` (all unique emails, primary's first)
    *   `phoneNumbers` (all unique phone numbers, primary's first)
    *   `secondaryContactIds`

## Local Setup & Running
**Steps:**

1.  **Clone:**
    ```bash
    git clone https://github.com/ayushranjan002/bitespeed-task.git
    cd YOUR_REPOSITORY_NAME
    ```
    *(Replace with your GitHub details)*

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    *   Copy `.env.example` to a new file named `.env`:
        ```bash
        cp .env.example .env
        ```
    *   Edit `.env` and set your `DATABASE_URL` for your local MySQL instance:
        ```
        DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME"
        ```

4.  **Database Migration:**
    ```bash
    npx prisma migrate dev
    ```
    *(You might be prompted for a migration name, e.g., "init")*

5.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The server will start, usually on `http://localhost:3000`.

## API Endpoint: `/identify`

*   **Method:** `POST`
*   **URL (Local):** `http://localhost:3000/identify`
*   **Request Body (JSON):**
    ```json
    {
        "email"?: "string",
        "phoneNumber"?: "string"
    }
    ```
*   **Success Response (200 OK):**
    ```json
    {
        "contact":{
            "primaryContatctId": number,
            "emails": ["string"],
            "phoneNumbers": ["string"],
            "secondaryContactIds": [number]
        }
    }
    ```

## Deployment of the Project

This application is deployed as a **Web Service** on **Render.com**.

Deployment:

App Server (Brains): Runs on Render.com. It takes requests and does the thinking.
Database (Memory): MySQL database lives on Railway.app. It stores all the contact data.
How they talk: The Render app uses a secret address (DATABASE_URL) to connect to the Railway database to save and get info.
---