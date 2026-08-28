import SwiftUI
struct Clean: View {
    var body: some View {
        VStack(spacing: 24) {
            Text("Ship a design system your team actually uses")
                .font(.custom("Sohne", size: 34))
                .foregroundStyle(Color(hex: "#1A1A1A"))
            Text("Read the guide").font(.system(size: 17))
        }
        .padding(32)
        .background(Color(hex: "#EDEEF0"))
        .cornerRadius(8)
    }
}
