import SwiftUI

struct ChatView: View {
    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isStreaming = false
    @State private var activeToolStatus: ChatMessage.ToolStatus?

    var body: some View {
        VStack(spacing: 0) {
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
                LazyVStack(spacing: 12) {
                    ForEach(messages) { message in
                        messageBubble(message)
                    }
                    if let tool = activeToolStatus {
                        toolIndicator(tool)
                            .id("tool-indicator")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .defaultScrollAnchor(.bottom)
            .onChange(of: messages.last?.content) {
                scrollToBottom(proxy)
            }
            .onChange(of: activeToolStatus?.label) {
                scrollToBottom(proxy)
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        if let lastId = messages.last?.id {
            withAnimation(.easeOut(duration: 0.15)) {
                if activeToolStatus != nil {
                    proxy.scrollTo("tool-indicator", anchor: .bottom)
                } else {
                    proxy.scrollTo(lastId, anchor: .bottom)
                }
            }
        }
    }

    @ViewBuilder
    private func messageBubble(_ message: ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 60) }

            Text(message.content)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(message.role == .user ? Color.orange : Color(UIColor.systemGray5))
                .foregroundStyle(message.role == .user ? .white : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 16))

            if message.role == .assistant { Spacer(minLength: 60) }
        }
        .id(message.id)
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
        HStack(spacing: 10) {
            TextField("Ask about an event...", text: $inputText, axis: .vertical)
                .lineLimit(1...4)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(UIColor.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 20))

            Button {
                if isStreaming {
                    stopStreaming()
                } else {
                    sendMessage()
                }
            } label: {
                Image(systemName: isStreaming ? "stop.circle.fill" : "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(isStreaming ? .red : (inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .gray : .orange))
            }
            .disabled(!isStreaming && inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        messages.append(ChatMessage(role: .user, content: text))
        inputText = ""
        isStreaming = true

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
                activeToolStatus = nil
                messages[assistantIndex].content += text
            case .toolStart(let tool):
                activeToolStatus = ChatMessage.toolStatus(for: tool)
            case .toolResult:
                activeToolStatus = nil
            case .done:
                activeToolStatus = nil
                isStreaming = false
                // Remove empty assistant messages
                if messages[assistantIndex].content.isEmpty {
                    messages.remove(at: assistantIndex)
                }
            case .error(let message):
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
        activeToolStatus = nil
    }
}
