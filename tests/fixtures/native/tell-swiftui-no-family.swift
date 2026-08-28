import SwiftUI
// Declares no font family: SF is a SYSTEM face, not a badly-made choice.
struct NoFamily: View {
    var body: some View { Text("Hello").font(.system(size: 18)) }
}
