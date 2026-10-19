import { Atmosphere } from "@/components/Atmosphere";
import ChatWindow from "@/components/ChatWindow";

export const metadata = { title: "Chat — Physiotherapy Treatment at Home" };

/** Full-screen chat; also the page the website widget (/widget.js) opens in its iframe. */
export default function ChatPage() {
  return (
    <>
      <Atmosphere />
      <ChatWindow variant="embed" />
    </>
  );
}
