export const ROUTING_BASE_GIT_SHA = "967f1cffd7a5e3bb3eaaf20f3210c6629b01a7b6";

export const PILOT_POLICY = Object.freeze({
  "native-ios": Object.freeze({
    artifact: "native-ios-application",
    briefId: "native-ios-dictionary-search-v1",
    briefPath: "briefs/native-ios-dictionary-search.json",
    briefSha256: "e675eadae50086486252a58310fc43cf4cb07b4141ef008003f0f451b3f2ad04",
    appRoot: "apps/native-ios-dictionary-search",
    generatorId: "terra-native-ios-pilot-01",
    activationPath: "apps/native-ios-dictionary-search/activation-receipt.json",
    unitTests: 7,
    uiTests: 7,
    capturePaths: Object.freeze([
      "screenshots/native-ios-iphone-17e-results-light.png",
      "screenshots/native-ios-iphone-17-pro-results-light.png",
      "screenshots/native-ios-offline-ax-retry-hittable.png",
      "screenshots/native-ios-iphone-17-pro-offline-dark-ax.png",
    ]),
  }),
  "native-ipados": Object.freeze({
    artifact: "native-ipados-application",
    briefId: "native-ipados-project-workspace-v1",
    briefPath: "briefs/native-ipados-project-workspace.json",
    briefSha256: "77d3c3959ae478549c6d6715dd2fa072e9ea3bad22787779bbfdf8d288b39771",
    appRoot: "apps/native-ipados-project-workspace",
    generatorId: "terra-native-ipados-pilot-01",
    activationPath: "apps/native-ipados-project-workspace/capability-activation.json",
    unitTests: 7,
    uiTests: 5,
    capturePaths: Object.freeze([
      "screenshots/native-ipados-ipad-mini-searching-light.png",
      "screenshots/native-ipados-ipad-pro-second-window-dark.png",
      "screenshots/native-ipados-independent-scene-proven.png",
      "screenshots/native-ipados-responsive-selection-preserved.png",
    ]),
  }),
});
