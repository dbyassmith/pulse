import SwiftUI

struct OrangeDot: View {
    @State private var offset: CGSize = .zero
    private let bounds: CGFloat = 3
    private let color = Color(red: 0.949, green: 0.549, blue: 0.220)

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 4, height: 4)
            .offset(offset)
            .onAppear {
                withAnimation(
                    .easeInOut(duration: Double.random(in: 1.8...2.5))
                    .repeatForever(autoreverses: true)
                ) {
                    offset = CGSize(
                        width: CGFloat.random(in: -bounds...bounds),
                        height: CGFloat.random(in: -bounds...bounds)
                    )
                }
            }
    }
}
