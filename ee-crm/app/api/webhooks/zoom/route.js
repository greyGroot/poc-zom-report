// ee-crm/app/api/webhooks/zoom/route.js
// App Router webhook route delegating directly to authoritative Zoom webhook handler

import handler from '@/lib/infrastructure/zoom-webhook-handler.js';

export async function POST(request) {
  return handler(request);
}

export async function GET(request) {
  return handler(request);
}

export async function OPTIONS(request) {
  return handler(request);
}
