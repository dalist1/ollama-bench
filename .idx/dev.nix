{ pkgs }: {
  channel = "unstable";
  packages =
    let
      bunLatest = builtins.fetchurl {
        url = "https://github.com/oven-sh/bun/releases/download/canary/bun-linux-x64.zip";
      };
    in
    [
      pkgs.nodejs_23
      (pkgs.bun.overrideAttrs (oldAttrs: {
        version = "canary";
        src = bunLatest;
      }))
    ];
  idx.extensions = [
    "biomejs.biome"
    "BeardedBear.beardedicons"
    "BeardedBear.beardedtheme"
  ];
}