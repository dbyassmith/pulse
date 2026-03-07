import SwiftUI

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isLoading = false

    var onLogin: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("Goldfish")
                .font(.largeTitle.bold())

            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .padding()
                    .background(.fill.tertiary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .padding()
                    .background(.fill.tertiary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.callout)
            }

            Button {
                Task { await signIn() }
            } label: {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(email.isEmpty || password.isEmpty || isLoading)

            Spacer()
        }
        .padding(.horizontal, 32)
    }

    private func signIn() async {
        isLoading = true
        errorMessage = nil
        do {
            try await SupabaseService.shared.signIn(email: email, password: password)
            onLogin()
        } catch {
            errorMessage = "Invalid email or password."
        }
        isLoading = false
    }
}
