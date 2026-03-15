import Foundation
import Supabase

enum ChatEvent {
    case textDelta(String)
    case toolStart(String)
    case toolResult(String, Bool)
    case done
    case error(String)
}

@MainActor
final class ChatService {
    static let shared = ChatService()

    private let baseURL: String
    private var currentTask: Task<Void, Never>?

    private init() {
        baseURL = Bundle.main.infoDictionary?["API_BASE_URL"] as? String ?? "http://localhost:3000"
    }

    var isStreaming: Bool {
        currentTask != nil
    }

    func sendMessage(
        messages: [(role: String, content: String)],
        onEvent: @escaping (ChatEvent) -> Void
    ) {
        cancel()

        currentTask = Task {
            defer { currentTask = nil }

            do {
                let session = try await SupabaseService.shared.client.auth.session
                let accessToken = session.accessToken
                print("[ChatService] Token prefix: \(String(accessToken.prefix(20)))...")
                print("[ChatService] Base URL: \(baseURL)")
                print("[ChatService] Token length: \(accessToken.count)")

                guard let url = URL(string: "\(baseURL)/chat") else {
                    onEvent(.error("Invalid API URL"))
                    onEvent(.done)
                    return
                }

                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

                let body: [[String: String]] = messages.map { ["role": $0.role, "content": $0.content] }
                request.httpBody = try JSONSerialization.data(withJSONObject: ["messages": body])

                let (bytes, response) = try await URLSession.shared.bytes(for: request)

                if let httpResponse = response as? HTTPURLResponse {
                    print("[ChatService] Response status: \(httpResponse.statusCode)")
                    if httpResponse.statusCode == 401 {
                        // Try to read the response body for more detail
                        var body = ""
                        for try await line in bytes.lines {
                            body += line
                        }
                        print("[ChatService] 401 response body: \(body)")
                        onEvent(.error("Session expired. Please sign out and sign back in."))
                        onEvent(.done)
                        return
                    }
                    if httpResponse.statusCode != 200 {
                        var body = ""
                        for try await line in bytes.lines {
                            body += line
                        }
                        print("[ChatService] Error response body: \(body)")
                        onEvent(.error("Server error (\(httpResponse.statusCode))"))
                        onEvent(.done)
                        return
                    }
                }

                var eventType = ""
                var dataBuffer = ""

                // Note: bytes.lines skips empty lines, so we can't rely on
                // blank-line delimiters. Instead, emit the buffered event
                // whenever a new "event:" line arrives.
                for try await line in bytes.lines {
                    if Task.isCancelled { return }

                    if line.hasPrefix("event: ") {
                        // New event starting — flush previous if complete
                        if !eventType.isEmpty && !dataBuffer.isEmpty {
                            let event = parseEvent(type: eventType, data: dataBuffer)
                            onEvent(event)
                            if case .done = event { return }
                        }
                        eventType = String(line.dropFirst(7))
                        dataBuffer = ""
                    } else if line.hasPrefix("data: ") {
                        dataBuffer = String(line.dropFirst(6))
                    }
                }

                // Flush last buffered event
                if !eventType.isEmpty && !dataBuffer.isEmpty {
                    let event = parseEvent(type: eventType, data: dataBuffer)
                    onEvent(event)
                    if case .done = event { return }
                }

                // Stream ended without done event
                if !Task.isCancelled {
                    onEvent(.done)
                }
            } catch is CancellationError {
                // User cancelled — do nothing
            } catch {
                onEvent(.error("Connection failed: \(error.localizedDescription)"))
                onEvent(.done)
            }
        }
    }

    func cancel() {
        currentTask?.cancel()
        currentTask = nil
    }

    private func parseEvent(type: String, data: String) -> ChatEvent {
        guard let jsonData = data.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            return .error("Failed to parse event data")
        }

        switch type {
        case "text_delta":
            if let text = json["text"] as? String {
                return .textDelta(text)
            }
        case "tool_start":
            if let tool = json["tool"] as? String {
                return .toolStart(tool)
            }
        case "tool_result":
            let tool = json["tool"] as? String ?? "unknown"
            let hasError = json["error"] != nil
            return .toolResult(tool, !hasError)
        case "done":
            return .done
        case "error":
            let message = json["message"] as? String ?? "Unknown error"
            return .error(message)
        default:
            break
        }

        return .error("Unknown event: \(type)")
    }
}
