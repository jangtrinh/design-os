import { PILOT_TIER_CONTRACTS } from "./proof-tier-contracts.mjs";

export const ROUTING_BASE_GIT_SHA = "967f1cffd7a5e3bb3eaaf20f3210c6629b01a7b6";

export const PILOT_POLICY = Object.freeze({
  "native-ios": Object.freeze({
    artifact: "native-ios-application",
    briefId: "native-ios-tocchien-modernization-v1",
    briefPath: "briefs/native-ios-tocchien-modernization.json",
    briefSha256: "6a07e697b0688877984a8147f05530f5f432c18e1be0ec54d7a52ee54bc87246",
    appRoot: "apps/native-ios-tocchien-modernization",
    generatorId: "terra-native-ios-tocchien-generator-03",
    activationPath: "apps/native-ios-tocchien-modernization/activation-receipt.json",
    activationRequestPath: "generator-packets/native-ios-tocchien-modernization-activation-request.json",
    sourceLineagePath: "evidence/tier-02-source-lineage-tocchien-v1.json",
    ownerVerdictPath: "evidence/tier-06-owner-verdict-tocchien-v1.json",
    ownerAcceptance: Object.freeze({
      ownerId: "Jang",
      verbatim: "OK, ổn rồi.",
      language: "vi",
      scope: "all-three-presented-screen-groups",
      recordedAt: "2026-08-29T15:43:57Z",
    }),
    tierContracts: PILOT_TIER_CONTRACTS["native-ios"],
    unitTests: 8,
    uiTests: 8,
    visualStressRequired: false,
    controllerVerificationHarnessFiles: Object.freeze([
      Object.freeze({
        path: "TocChienModernizationUITests/TocChienBehaviorUITests.swift",
        sha256: "2354095a4256f447b3a7e765c891984f72b3b13cc8fafab5c0c69ac4ba57ae36",
      }),
      Object.freeze({
        path: "TocChienModernizationUITests/TocChienLayoutUITests.swift",
        sha256: "33b0cc43e0da79b419657132d8ba8a7839b5172db4ff6a5d75c50bb3d9c1ec2c",
      }),
    ]),
    capturePaths: Object.freeze([
      "screenshots/native-ios-tocchien-iphone-17e-champion-catalog-light-large.png",
      "screenshots/native-ios-tocchien-iphone-17-pro-champion-catalog-dark-large.png",
      "screenshots/native-ios-tocchien-iphone-17e-champion-detail-light-large.png",
      "screenshots/native-ios-tocchien-iphone-17-pro-champion-detail-dark-large.png",
      "screenshots/native-ios-tocchien-iphone-17e-game-dictionary-light-large.png",
      "screenshots/native-ios-tocchien-iphone-17-pro-game-dictionary-dark-large.png",
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
    activationRequestPath: "generator-packets/native-ipados-activation-request.json",
    tierContracts: PILOT_TIER_CONTRACTS["native-ipados"],
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
