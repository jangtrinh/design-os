import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("Supercharge your enterprise-grade workflow")
                .font(.custom("Inter", size: 32))
                .foregroundStyle(
                    LinearGradient(colors: [Color(hex: "#7C3AED"), Color(hex: "#2563EB")],
                                   startPoint: .leading, endPoint: .trailing))
            Text("caption")
                .font(.system(size: 11))
                .foregroundColor(Color(white: 0.62))
            VStack {
                VStack {
                    Text("nested card")
                }
                .padding(16)
                .background(Color.white)
                .cornerRadius(12)
            }
            .padding(16)
            .background(Color(hex: "#FAF7F0"))
            .cornerRadius(16)
            .overlay(Rectangle().fill(Color.purple).frame(width: 4), alignment: .leading)
            Circle().frame(width: 8, height: 8).foregroundColor(.green)
                .scaleEffect(pulse ? 1.4 : 1.0)
                .animation(.easeInOut.repeatForever(), value: pulse)
        }
        .padding(16)
        .background(LinearGradient(colors: [.purple, .blue], startPoint: .top, endPoint: .bottom))
    }
}
