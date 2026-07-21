"use client";

import { createAuthClient } from "better-auth/react";

// Auth client สำหรับ Client Components — เรียก /api/auth/* บน origin เดียวกัน
export const authClient = createAuthClient();
