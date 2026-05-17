export default {
  expo: {
    name: "Golfmatch Dating",
    slug: "golfmatch",
    version: "1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    // Explicitly enable Hermes for better performance in release builds
    jsEngine: "hermes",
    scheme: "Golfmatch",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "golfmatchdating.us.com",
      googleServicesFile: "./GoogleService-Info.plist",
      infoPlist: {
        UIBackgroundModes: [
          "remote-notification"
        ],
        ITSAppUsesNonExemptEncryption: false,
        // URL schemes that the app can query (required for Linking.canOpenURL on iOS 9+)
        LSApplicationQueriesSchemes: [
          "instagram",
          "instagram-stories",
          "twitter",
          "fb",
          "sms"
        ],
        NSCameraUsageDescription: "Golfmatch uses the camera to take photos and videos for your posts, and to capture ID documents for identity verification. For example: snap a photo from your round to add to a post.",
        NSPhotoLibraryUsageDescription: "Golfmatch accesses your photo library so you can choose existing photos or videos for posts and your profile picture. For example: pick a golf photo from your camera roll to add to a post.",
        NSMicrophoneUsageDescription: "Golfmatch uses the microphone to record audio when you capture video for your posts. For example: record your swing video with sound.",
        NSUserNotificationsUsageDescription: "Used to send notifications about new matches, messages, likes, and other activity. For example: get notified when you have a new match.",
        // ATT (App Tracking Transparency) permission message for iOS 14+
        NSUserTrackingUsageDescription: "Used to show ads that are more relevant to you."
      },
      buildNumber: "39"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "golfmatchdating.us.com",
      googleServicesFile: "./google-services.json",
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      // Environment variables will be available via Constants.expoConfig.extra
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_RAKUTEN_APP_ID: process.env.EXPO_PUBLIC_RAKUTEN_APP_ID,
      eas: {
        projectId: "3449867b-e6b3-45f2-8569-47389c202518"
      }
    },
    owner: "zhoueverwin",
    plugins: [
      [
        "expo-splash-screen",
        {
          backgroundColor: "#21B2AA",
          image: "./assets/images/Icons/GolfMatch-1024.png",
          imageWidth: 600
        }
      ],
      "expo-video",
      [
        "@react-native-google-signin/google-signin",
        {
          // REVERSED_CLIENT_ID derived from iOS Client ID:
          // 986630263277-req5hpcfnmn5fshasesflknrcjkjmusl.apps.googleusercontent.com
          // (US bundle: golfmatchdating.us.com)
          iosUrlScheme: "com.googleusercontent.apps.986630263277-req5hpcfnmn5fshasesflknrcjkjmusl"
        }
      ],
      // Facebook SDK for Meta Ads tracking
      [
        "react-native-fbsdk-next",
        {
          appID: "2701896453510217",
          clientToken: "8a26b940143e8a48123a3320cfc02c26",
          displayName: "Golfmatch Dating",
          scheme: "fb2701896453510217",
          advertiserIDCollectionEnabled: true,
          autoLogAppEventsEnabled: true,
          isAutoInitEnabled: true,
          iosUserTrackingPermission: "Used to show ads that are more relevant to you."
        }
      ],
      // App Tracking Transparency for iOS 14+
      [
        "expo-tracking-transparency",
        {
          userTrackingPermission: "Used to show ads that are more relevant to you."
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#4A90E2",
          iosDisplayInForeground: true
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Golfmatch accesses your photo library so you can choose existing photos or videos for posts and your profile picture. For example: pick a golf photo from your camera roll to add to a post.",
          cameraPermission: "Golfmatch uses the camera to take photos and videos for your posts, and to capture ID documents for identity verification. For example: snap a photo from your round to add to a post.",
          microphonePermission: "Golfmatch uses the microphone to record audio when you capture video for your posts. For example: record your swing video with sound."
        }
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Golfmatch uses the camera to take photos and videos for your posts, and to capture ID documents for identity verification. For example: snap a photo from your round to add to a post.",
          microphonePermission: "Golfmatch uses the microphone to record audio when you capture video for your posts. For example: record your swing video with sound.",
          recordAudioAndroid: true
        }
      ],
      [
        "expo-media-library",
        {
          photosPermission: "Golfmatch saves photos and videos you create to your photo library so you can keep them on your device. For example: save a photo you captured to your camera roll.",
          savePhotosPermission: "Golfmatch saves photos and videos you create to your photo library so you can keep them on your device. For example: save a photo you captured to your camera roll.",
          isAccessMediaLocationEnabled: true
        }
      ],
      "react-native-compressor",
      "@react-native-firebase/app",
      ["expo-build-properties", { ios: { useFrameworks: "static" } }],
      "./plugins/withFirebaseFix",
    ],
    notification: {
      icon: "./assets/icon.png",
      color: "#4A90E2",
      androidMode: "default",
      androidCollapsedTitle: "New notifications"
    }
  }
};

