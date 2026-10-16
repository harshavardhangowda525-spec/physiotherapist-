import crypto from "node:crypto";
import { query } from "./db";
import { classifyIntent } from "./ai";
import { handleMessage, initialState, type ConvState, type Deps, type Turn } from "./conversation";
import { createEnquiry, findForPatient, patientRequestChange } from "./enquiries";

export function depsFor(source: "website" | "whatsapp"): Deps {
  return {
    submit: async (d) => {
      const { enquiry } = await createEnquiry({ ...d, source });
      return { reference: enquiry.reference };
    },
    lookup: (ref, phone) => findForPatient(ref, phone),
    requestChange: (ref, phone, kind, detail) => patientRequestChange(ref, phone, kind, detail),
    classify: classifyIntent,
  };
}

export const newWebConversationId = () => "web:" + crypto.randomBytes(18).toString("base64url");

export async function loadState(id: string): Promise<ConvState> {
  const rows = await query<{ state: ConvState }>(`SELECT state FROM conversations WHERE id=$1 AND updated_at > now() - interval '24 hours'`, [id]);
  return rows[0]?.state ?? initialState();
}

export async function saveState(id: string, channel: string, state: ConvState) {
  await query(
    `INSERT INTO conversations (id, channel, state, updated_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state, updated_at=now()`,
    [id, channel, JSON.stringify(state)],
  );
}

export async function converse(id: string, channel: "website" | "whatsapp", text: string): Promise<Turn> {
  const state = await loadState(id);
  const result = await handleMessage(state, text, depsFor(channel));
  await saveState(id, channel, result.state);
  return result;
}
