import { ChatWidget } from "@/components/chat-widget";

export const metadata = { title: "Chat with V Square Projects" };

/** Public chat page. Embedded on the website through /widget.js (iframe). */
export default function ChatPage() {
  return (
    <div className="h-[100dvh]">
      <ChatWidget compact storageKey="vs-public-chat" suggestions={["I want a plot in Hosur", "ನನಗೆ ಫ್ಲಾಟ್ ಬೇಕು", "Villa options?", "Book a site visit"]} />
    </div>
  );
}
