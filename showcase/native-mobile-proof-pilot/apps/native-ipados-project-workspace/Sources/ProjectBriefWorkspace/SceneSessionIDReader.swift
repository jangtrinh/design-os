import SwiftUI
import UIKit

struct SceneSessionIDReader: UIViewRepresentable {
    let onSessionID: (String) -> Void

    func makeUIView(context: Context) -> SceneSessionIDView {
        let view = SceneSessionIDView()
        view.onSessionID = onSessionID
        return view
    }

    func updateUIView(_ uiView: SceneSessionIDView, context: Context) {
        uiView.onSessionID = onSessionID
        uiView.publishSessionID()
    }
}

final class SceneSessionIDView: UIView {
    var onSessionID: ((String) -> Void)?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        publishSessionID()
    }

    func publishSessionID() {
        guard let sessionID = window?.windowScene?.session.persistentIdentifier else { return }
        DispatchQueue.main.async { [weak self] in
            self?.onSessionID?(sessionID)
        }
    }
}
