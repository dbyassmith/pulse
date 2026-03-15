import SwiftUI

struct ChatView: View {
    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isStreaming = false
    @State private var activeToolStatus: ChatMessage.ToolStatus?
    @State private var isThinking = false

    var body: some View {
        ZStack(alignment: .bottom) {
            if messages.isEmpty {
                emptyState
            } else {
                messageList
            }
            inputBar
        }
        .background(Color("AppBackground"))
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Ask about any upcoming event")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("\"When is the NFL draft?\"")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
            Spacer()
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 28) {
                    ForEach(messages) { message in
                        messageBubble(message)
                    }
                    if isThinking {
                        thinkingIndicator
                            .id("thinking-indicator")
                    }
                    if let tool = activeToolStatus {
                        toolIndicator(tool)
                            .id("tool-indicator")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 80)
            }
            .defaultScrollAnchor(.top)
            .onChange(of: messages.last?.content) {
                scrollToBottom(proxy)
            }
            .onChange(of: activeToolStatus?.label) {
                scrollToBottom(proxy)
            }
            .onChange(of: isThinking) {
                scrollToBottom(proxy)
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        if let lastId = messages.last?.id {
            withAnimation(.easeOut(duration: 0.15)) {
                if activeToolStatus != nil {
                    proxy.scrollTo("tool-indicator", anchor: .bottom)
                } else if isThinking {
                    proxy.scrollTo("thinking-indicator", anchor: .bottom)
                } else {
                    proxy.scrollTo(lastId, anchor: .bottom)
                }
            }
        }
    }

    @ViewBuilder
    private func messageBubble(_ message: ChatMessage) -> some View {
        if message.role == .user {
            HStack {
                Spacer(minLength: 60)
                Text(message.content)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.black)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .id(message.id)
        } else {
            // Plain text rendering for assistant messages to prevent phishing via Markdown links
            Text(message.content)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(message.id)
        }
    }

    private var thinkingIndicator: some View {
        HStack {
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.small)
                Text("Thinking...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color(UIColor.systemGray5))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            Spacer(minLength: 60)
        }
    }

    private func toolIndicator(_ status: ChatMessage.ToolStatus) -> some View {
        HStack {
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                Text(status.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color(UIColor.systemGray5))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            Spacer(minLength: 60)
        }
    }

    private var inputBar: some View {
        HStack(alignment: .center, spacing: 10) {
            TextField("Ask about an event...", text: $inputText, axis: .vertical)
                .lineLimit(1...4)
                .padding(.vertical, 3)

            Button {
                if isStreaming {
                    stopStreaming()
                } else {
                    sendMessage()
                }
            } label: {
                Image(systemName: isStreaming ? "stop.fill" : "arrow.up")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(isStreaming ? .red : (inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.gray : Color.orange))
                    .clipShape(Circle())
            }
            .disabled(!isStreaming && inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 24)
                .fill(Color(UIColor.systemBackground))
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .strokeBorder(Color(UIColor.systemGray4), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        messages.append(ChatMessage(role: .user, content: text))
        inputText = ""
        isStreaming = true
        isThinking = true

        // Build history (only user/assistant text, no tool events)
        let history: [(role: String, content: String)] = messages
            .map { (role: $0.role == .user ? "user" : "assistant", content: $0.content) }

        // Add placeholder for assistant response
        let assistantMessage = ChatMessage(role: .assistant, content: "")
        messages.append(assistantMessage)
        let assistantIndex = messages.count - 1

        ChatService.shared.sendMessage(messages: history) { event in
            switch event {
            case .textDelta(let text):
                isThinking = false
                activeToolStatus = nil
                messages[assistantIndex].content += text
            case .toolStart(let tool):
                isThinking = false
                activeToolStatus = ChatMessage.toolStatus(for: tool)
            case .toolResult:
                activeToolStatus = nil
            case .done:
                isThinking = false
                activeToolStatus = nil
                isStreaming = false
                // Remove empty assistant messages
                if messages[assistantIndex].content.isEmpty {
                    messages.remove(at: assistantIndex)
                }
            case .error(let message):
                isThinking = false
                activeToolStatus = nil
                if messages[assistantIndex].content.isEmpty {
                    messages[assistantIndex].content = message
                } else {
                    messages[assistantIndex].content += "\n\n\(message)"
                }
            }
        }
    }

    private func stopStreaming() {
        ChatService.shared.cancel()
        isStreaming = false
        isThinking = false
        activeToolStatus = nil
    }
}
