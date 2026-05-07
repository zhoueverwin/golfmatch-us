/**
 * Expo config plugin to fix Firebase build errors with Xcode 26 + Expo SDK 54.
 *
 * Firebase iOS SDK uses non-modular header imports (#import <React/RCTBridgeModule.h>)
 * which cause build failures when combined with Expo's use_frameworks! :linkage => :static.
 *
 * Xcode 26 enforces stricter module validation, causing two classes of errors:
 * 1. "include of non-modular header inside framework module" — React headers aren't modular
 * 2. "declaration of X must be imported from module Y" — module ownership conflicts
 *
 * This plugin fixes both by:
 * - Setting CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES on the main project
 * - Injecting Podfile post_install hooks to set compiler flags on all pod targets
 * - Disabling module maps for RNFirebase pods to avoid ownership conflicts
 */
const { withXcodeProject, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withFirebaseFix = (config) => {
  // 1. Set flag on main Xcode project build configurations
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigurations = project.pbxXCBuildConfigurationSection();

    for (const key in buildConfigurations) {
      const buildConfig = buildConfigurations[key];
      if (
        typeof buildConfig === "object" &&
        buildConfig.buildSettings
      ) {
        buildConfig.buildSettings.CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = "YES";
      }
    }

    return config;
  });

  // 2. Modify Podfile to add compiler flags on pod targets
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfileContent = fs.readFileSync(podfilePath, "utf-8");

      const fixCode = [
        "",
        "    # [withFirebaseFix] Xcode 26 non-modular header fix for pod targets",
        "    installer.pods_project.targets.each do |target|",
        "      target.build_configurations.each do |bc|",
        "        bc.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
        "        bc.build_settings['OTHER_CFLAGS'] = '$(inherited) -Wno-non-modular-include-in-framework-module'",
        "        if target.name.start_with?('RNFB')",
        "          bc.build_settings['DEFINES_MODULE'] = 'NO'",
        "        end",
        "      end",
        "    end",
      ].join("\n");

      // Inject before the closing `end` of the post_install block.
      // The Expo-generated Podfile ends with:
      //     react_native_post_install(...)
      //   end      <- closes post_install
      // end        <- closes target
      const marker = "  end\nend";
      const lastIndex = podfileContent.lastIndexOf(marker);
      if (lastIndex !== -1) {
        podfileContent =
          podfileContent.slice(0, lastIndex) +
          fixCode +
          "\n  end\nend\n";
      }

      fs.writeFileSync(podfilePath, podfileContent, "utf-8");
      return config;
    },
  ]);

  return config;
};

module.exports = withFirebaseFix;
