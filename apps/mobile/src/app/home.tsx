import { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Platform,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import Svg, {
  Path,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  getMe,
  getCustomerDashboard,
  getCustomerRuns,
  executeTestRun,
  getApiUrl,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

interface LoadedFileInfo {
  name: string;
  size: number;
  type: "program" | "json" | "other";
  rawContent?: string;
  parsedJson?: any;
  error?: string;
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const queryClient = useQueryClient();

  // Active Tab: "overview" | "station" | "results"
  const [activeTab, setActiveTab] = useState<"overview" | "station" | "results">("overview");

  // File loading states
  const [folderName, setFolderName] = useState<string | null>(null);
  const [programFile, setProgramFile] = useState<LoadedFileInfo | null>(null);
  const [jsonFile, setJsonFile] = useState<LoadedFileInfo | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  // Live Test Execution states
  const [testingProgress, setTestingProgress] = useState<string | null>(null);
  const [lastTestResult, setLastTestResult] = useState<any | null>(null);

  // Results search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<string>("ALL");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Pulse & Breathing Animation for circular neon button
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.75,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim, glowAnim]);

  // Tactile touch / press spring animations for buttons
  const loadPressScale = useRef(new Animated.Value(1)).current;
  const testPressScale = useRef(new Animated.Value(1)).current;

  const handleLoadPressIn = () => {
    Animated.spring(loadPressScale, {
      toValue: 0.91,
      friction: 5,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleLoadPressOut = () => {
    Animated.spring(loadPressScale, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const handleTestPressIn = () => {
    Animated.spring(testPressScale, {
      toValue: 0.91,
      friction: 5,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleTestPressOut = () => {
    Animated.spring(testPressScale, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  // Queries
  const me = useQuery({
    queryKey: ["me", token],
    queryFn: () => getMe(token!),
    enabled: !!token,
  });

  const dashboardQuery = useQuery({
    queryKey: ["customer-dashboard", token],
    queryFn: () => getCustomerDashboard(token!),
    enabled: !!token,
  });

  const runsQuery = useQuery({
    queryKey: ["customer-runs", token, verdictFilter, searchQuery],
    queryFn: () =>
      getCustomerRuns(token!, {
        verdict: verdictFilter,
        search: searchQuery,
        take: 50,
      }),
    enabled: !!token,
  });

  // Mutation to execute real PCB test
  const executeMutation = useMutation({
    mutationFn: () =>
      executeTestRun(token!, {
        programFileName: programFile?.name || "firmware.bin",
        jsonConfig: jsonFile?.parsedJson || {
          product: "WLC-ECO",
          testStages: [
            "POWER_RAIL_3V3_CHECK",
            "POWER_RAIL_5V0_CHECK",
            "MCU_FLASH_PROGRAMMING",
            "RELAY_CYCLE_TEST",
            "WATER_SENSOR_CALIBRATION",
            "MODBUS_UART_VERIFY",
          ],
        },
      }),
    onMutate: () => {
      setLastTestResult(null);
      setTestingProgress("Initializing station probe & power rails...");
      setTimeout(() => setTestingProgress("Flashing program binary to MCU..."), 800);
      setTimeout(() => setTestingProgress("Running test stages & measuring telemetry..."), 1600);
    },
    onSuccess: (data) => {
      setTestingProgress(null);
      setLastTestResult(data);
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["customer-runs"] });
      // Automatically navigate to Test Results so the user sees their new test
      setTimeout(() => {
        setActiveTab("results");
      }, 1200);
    },
    onError: (err: any) => {
      setTestingProgress(null);
      setFileError(err?.message || "Test execution failed on station.");
    },
  });

  const handleSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  // Helper to categorize and parse loaded files
  async function processFiles(
    files: Array<{ name: string; size?: number; text?: () => Promise<string>; content?: string; relativePath?: string }>
  ) {
    setFileError(null);
    setLoadingFiles(true);

    try {
      let foundProgram: LoadedFileInfo | null = null;
      let foundJson: LoadedFileInfo | null = null;

      for (const f of files) {
        const lower = f.name.toLowerCase();
        const size = f.size || 0;

        if (lower.endsWith(".json")) {
          let content = "";
          let parsed: any = null;
          let jsonErr: string | undefined;

          if (f.text) {
            try {
              content = await f.text();
              parsed = JSON.parse(content);
            } catch (err: any) {
              jsonErr = "Invalid JSON syntax: " + err.message;
            }
          } else if (f.content) {
            try {
              content = f.content;
              parsed = JSON.parse(content);
            } catch (err: any) {
              jsonErr = "Invalid JSON syntax: " + err.message;
            }
          }

          foundJson = {
            name: f.name,
            size,
            type: "json",
            rawContent: content,
            parsedJson: parsed,
            error: jsonErr,
          };
        } else if (!lower.endsWith(".ds_store") && !lower.endsWith(".gitkeep")) {
          foundProgram = {
            name: f.name,
            size,
            type: "program",
          };
        }
      }

      if (foundProgram) setProgramFile(foundProgram);
      if (foundJson) setJsonFile(foundJson);

      if (!foundProgram && !foundJson) {
        setFileError("No test files detected in the folder. Please ensure the folder contains a program file and a .json configuration file.");
      }
    } catch (err: any) {
      setFileError(err?.message || "Failed to load files from local computer.");
    } finally {
      setLoadingFiles(false);
    }
  }

  // Direct Folder Picker
  function triggerFolderUpload(isFolder = true) {
    setFileError(null);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      if (isFolder) {
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
      }
      input.multiple = true;

      input.onchange = async (e: any) => {
        const rawFiles: File[] = Array.from(e.target.files || []);
        if (!rawFiles || rawFiles.length === 0) return;

        const firstRelative = (rawFiles[0] as any).webkitRelativePath;
        if (firstRelative) {
          const folder = firstRelative.split("/")[0];
          setFolderName(folder);
        } else {
          setFolderName("Selected Package");
        }

        const mapped = rawFiles.map((f) => ({
          name: f.name,
          size: f.size,
          relativePath: (f as any).webkitRelativePath || f.name,
          text: () => f.text(),
        }));
        await processFiles(mapped);
      };

      input.click();
    } else {
      DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      })
        .then(async (result) => {
          if (!result.canceled && result.assets) {
            setFolderName("Mobile Package");
            const mapped = result.assets.map((a) => ({
              name: a.name,
              size: a.size || 0,
            }));
            await processFiles(mapped);
          }
        })
        .catch((err) => {
          setFileError(err.message || "Failed to open document picker");
        });
    }
  }

  function handleResetFiles() {
    setFolderName(null);
    setProgramFile(null);
    setJsonFile(null);
    setFileError(null);
    setShowJsonPreview(false);
    setLastTestResult(null);
  }

  const bothFilesLoaded = !!programFile && !!jsonFile;
  const dash = dashboardQuery.data;

  // Chart coordinate calculations matching the reference design
  const chartData = useMemo(() => {
    const daily = dash?.dailyUniquePcbs || [];
    if (daily.length === 0) return null;

    const values = daily.map((d: any) => d.uniqueBoards);
    const maxVal = Math.max(...values, 10);
    const yMax = Math.ceil(maxVal / 9) * 9 || 36;
    const ySteps = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];

    const chartWidth = isMobile ? Math.min(width - 48, 540) : 620;
    const chartHeight = isMobile ? 180 : 210;
    const paddingLeft = 32;
    const paddingRight = 12;
    const paddingTop = 12;
    const paddingBottom = 26;

    const plotWidth = chartWidth - paddingLeft - paddingRight;
    const plotHeight = chartHeight - paddingTop - paddingBottom;

    const points = daily.map((d: any, idx: number) => {
      const x = paddingLeft + (idx / Math.max(daily.length - 1, 1)) * plotWidth;
      const y = paddingTop + plotHeight - (d.uniqueBoards / yMax) * plotHeight;
      return { x, y, ...d };
    });

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlX = (current.x + next.x) / 2;
      linePath += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
    }

    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const bottomY = paddingTop + plotHeight;
    const areaPath = `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    return {
      chartWidth,
      chartHeight,
      paddingLeft,
      paddingTop,
      plotHeight,
      plotWidth,
      bottomY,
      yMax,
      ySteps,
      points,
      linePath,
      areaPath,
      daily,
    };
  }, [dash?.dailyUniquePcbs, isMobile, width]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ================================================================= */}
      {/* 1. TOP HEADER / OPERATOR BAR (RESPONSIVE FOR PHONE & DESKTOP) */}
      {/* ================================================================= */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        {/* Row 1: Brand Logo, Customer Badge, and Sign Out */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerBrand}>
            <Text style={styles.headerTitle}>FCT AUTOMATION</Text>
            <View style={styles.customerBadge}>
              <Text style={styles.customerBadgeText}>
                {dash?.customer?.name || me.data?.customer?.name || "Customer Station"}
              </Text>
            </View>
          </View>

          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        {/* Row 2: Full-width Segmented Tabs */}
        <View style={styles.navTabs}>
          <Pressable
            style={[styles.navTab, activeTab === "overview" && styles.navTabActive]}
            onPress={() => setActiveTab("overview")}
          >
            <Text style={[styles.navTabText, activeTab === "overview" && styles.navTabTextActive]}>
              Overview
            </Text>
          </Pressable>

          <Pressable
            style={[styles.navTab, activeTab === "station" && styles.navTabActive]}
            onPress={() => setActiveTab("station")}
          >
            <Text style={[styles.navTabText, activeTab === "station" && styles.navTabTextActive]}>
              Test Station
            </Text>
          </Pressable>

          <Pressable
            style={[styles.navTab, activeTab === "results" && styles.navTabActive]}
            onPress={() => setActiveTab("results")}
          >
            <Text style={[styles.navTabText, activeTab === "results" && styles.navTabTextActive]}>
              Test Results
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ================================================================= */}
      {/* TAB 1: OVERVIEW DASHBOARD MATCHING USER SCREENSHOT */}
      {/* ================================================================= */}
      {activeTab === "overview" && (
        <View style={styles.tabContent}>
          {dashboardQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>Loading customer metrics...</Text>
            </View>
          ) : dashboardQuery.isError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>⚠️ Could not connect to backend</Text>
              <Text style={styles.errorSubtitle}>
                Target: {getApiUrl()}/me/dashboard
              </Text>
              <Text style={styles.errorSubtitle}>
                Reason: {(dashboardQuery.error as any)?.message || "Network request failed"}
              </Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => dashboardQuery.refetch()}
              >
                <Text style={styles.retryButtonText}>🔄 Tap to Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Subtitle */}
              <Text style={styles.pageSubtitle}>
                Last 30 days / across your test stations
              </Text>

              {/* 1. STAT CARDS ROW (RESPONSIVE 2-COL ON PHONE, MULTI-COL ON DESKTOP) */}
              <View style={styles.statCardsRow}>
                {/* Total Revenue Highlight Card */}
                <View style={[styles.statCard, isMobile && styles.statCardMobile, styles.statCardHighlight]}>
                  <Text style={styles.statCardHighlightLabel}>Total Revenue</Text>
                  <Text style={styles.statCardHighlightValue}>
                    ₹{(dash?.totalPassRevenue ?? 0).toLocaleString()}
                  </Text>
                  <Text style={styles.statCardHighlightSub}>
                    ₹10 / passed PCB (PASS only)
                  </Text>
                </View>

                {/* Unique PCBs Tested */}
                <View style={[styles.statCard, isMobile && styles.statCardMobile]}>
                  <Text style={styles.statCardLabel}>Unique PCBs tested</Text>
                  <Text style={styles.statCardValue}>
                    {(dash?.uniquePcbsTested ?? 0).toLocaleString()}
                  </Text>
                </View>

                {/* Test Runs */}
                <View style={[styles.statCard, isMobile && styles.statCardMobile]}>
                  <Text style={styles.statCardLabel}>Test runs</Text>
                  <Text style={styles.statCardValue}>
                    {(dash?.totalRuns ?? 0).toLocaleString()}
                  </Text>
                </View>

                {/* Active Customers */}
                <View style={[styles.statCard, isMobile && styles.statCardMobile]}>
                  <Text style={styles.statCardLabel}>Active customers</Text>
                  <Text style={styles.statCardValue}>1</Text>
                </View>

                {/* Active Stations */}
                <View style={[styles.statCard, isMobile && styles.statCardMobile]}>
                  <Text style={styles.statCardLabel}>Active stations</Text>
                  <Text style={styles.statCardValue}>
                    {dash?.stations?.length ?? 0}
                  </Text>
                </View>

                {/* First-pass Yield */}
                <View style={[styles.statCard, isMobile && styles.statCardMobile]}>
                  <Text style={styles.statCardLabel}>First-pass yield</Text>
                  <Text style={styles.statCardValue}>
                    {dash?.firstPassYield ?? 0}%
                  </Text>
                </View>
              </View>

              {/* 2. AREA CHART & PROGRESS BREAKDOWN */}
              <View style={[styles.chartAndBreakdownRow, isMobile && styles.chartAndBreakdownMobile]}>
                {/* Area Chart Card */}
                <View style={[styles.chartCard, isMobile && styles.chartCardMobile]}>
                  <Text style={styles.cardHeaderTitle}>Unique PCBs per day</Text>

                  {chartData ? (
                    <View style={styles.svgChartWrapper}>
                      <Svg
                        viewBox={`0 0 ${chartData.chartWidth} ${chartData.chartHeight}`}
                        width="100%"
                        height={chartData.chartHeight}
                      >
                        <Defs>
                          <LinearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0%" stopColor="#2563eb" stopOpacity="0.4" />
                            <Stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                          </LinearGradient>
                        </Defs>

                        {/* Dashed Gridlines & Y-Axis */}
                        {chartData.ySteps.map((val, idx) => {
                          const y =
                            chartData.paddingTop +
                            chartData.plotHeight -
                            (val / chartData.yMax) * chartData.plotHeight;
                          return (
                            <View key={idx}>
                              <Line
                                x1={chartData.paddingLeft}
                                y1={y}
                                x2={chartData.chartWidth - 12}
                                y2={y}
                                stroke="#1e293b"
                                strokeDasharray="4 4"
                                strokeWidth="1"
                              />
                              <SvgText
                                x={chartData.paddingLeft - 8}
                                y={y + 4}
                                textAnchor="end"
                                fill="#64748b"
                                fontSize="10"
                                fontWeight="600"
                              >
                                {val}
                              </SvgText>
                            </View>
                          );
                        })}

                        {/* Area Gradient Fill */}
                        <Path d={chartData.areaPath} fill="url(#blueGradient)" />

                        {/* Spline Line */}
                        <Path
                          d={chartData.linePath}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2.5"
                        />

                        {/* X-Axis Date Labels */}
                        {chartData.points.map((pt: any, idx: number) => {
                          if (idx % (isMobile ? 4 : 2) !== 0 && idx !== chartData.points.length - 1) return null;
                          const label = pt.day.slice(5);
                          return (
                            <SvgText
                              key={idx}
                              x={pt.x}
                              y={chartData.bottomY + 16}
                              textAnchor="middle"
                              fill="#64748b"
                              fontSize="10"
                              fontWeight="500"
                            >
                              {label}
                            </SvgText>
                          );
                        })}
                      </Svg>
                    </View>
                  ) : (
                    <Text style={{ color: "#64748b", fontSize: 13, paddingVertical: 40 }}>
                      No test runs recorded in this period.
                    </Text>
                  )}
                </View>

                {/* Progress Breakdown Card */}
                <View style={[styles.breakdownCard, isMobile && styles.breakdownCardMobile]}>
                  <Text style={styles.cardHeaderTitle}>Top production by unique PCBs</Text>

                  <View style={{ gap: 16, marginTop: 14 }}>
                    {dash?.variantBreakdown && dash.variantBreakdown.length > 0 ? (
                      (() => {
                        const maxCount = Math.max(...dash.variantBreakdown.map((v: any) => v.count), 1);
                        return dash.variantBreakdown.map((item: any, idx: number) => {
                          const pct = Math.round((item.count / maxCount) * 100);
                          return (
                            <View key={idx} style={{ gap: 6 }}>
                              <View style={styles.breakdownRowHeader}>
                                <Text style={styles.breakdownName}>{item.name}</Text>
                                <Text style={styles.breakdownCount}>{item.count}</Text>
                              </View>
                              <View style={styles.progressBarTrack}>
                                <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                              </View>
                            </View>
                          );
                        });
                      })()
                    ) : (
                      <View style={{ gap: 6 }}>
                        <View style={styles.breakdownRowHeader}>
                          <Text style={styles.breakdownName}>WLC-ECO Controller</Text>
                          <Text style={styles.breakdownCount}>{dash?.uniquePcbsTested ?? 0}</Text>
                        </View>
                        <View style={styles.progressBarTrack}>
                          <View style={[styles.progressBarFill, { width: "100%" }]} />
                        </View>
                      </View>
                    )}

                    {/* Active Stations Online */}
                    {dash?.stations && dash.stations.length > 0 && (
                      <View style={{ marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#1e293b", gap: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
                          Active Stations
                        </Text>
                        {dash.stations.map((st: any) => (
                          <View key={st.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ color: "#cbd5e1", fontSize: 13, fontWeight: "600" }}>{st.id}</Text>
                            <Text style={{ color: "#10b981", fontSize: 11, fontWeight: "700" }}>ONLINE (v{st.firmwareVersion})</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {/* ================================================================= */}
      {/* TAB 2: TEST STATION (WITH USER'S NEON CIRCULAR UPWARD ARROW BUTTON) */}
      {/* ================================================================= */}
      {activeTab === "station" && (
        <View style={styles.tabContent}>
          {/* TWO SEPARATED WORKSPACE CARDS */}
          <View style={[styles.stationCardsRow, isMobile && styles.stationCardsRowMobile]}>
            {/* ---------------- CARD 1: TEST PACKAGE LOADER ---------------- */}
            <View style={[styles.stationCard, isMobile && styles.stationCardMobile]}>
              <View style={styles.stepBadgeRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>STEP 01</Text>
                </View>
                <Text style={styles.stepCardTitle}></Text>
              </View>
              

              {/* NEON CIRCULAR BUTTON WITH UPWARD ARROW (Reduced size + touch animation) */}
              <View style={styles.neonButtonContainer}>
                <Animated.View
                  style={[
                    styles.animatedWrapper,
                    {
                      transform: [
                        { scale: pulseAnim },
                        { scale: loadPressScale },
                      ],
                      opacity: glowAnim,
                    },
                  ]}
                >
                  <View style={styles.outerBezelRing}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.neonButtonDisc,
                        bothFilesLoaded && styles.neonButtonDiscActive,
                      ]}
                      onPressIn={handleLoadPressIn}
                      onPressOut={handleLoadPressOut}
                      onPress={() => triggerFolderUpload(true)}
                      disabled={loadingFiles || executeMutation.isPending}
                    >
                      <View
                        style={[
                          styles.radialAura,
                          bothFilesLoaded && styles.radialAuraActive,
                        ]}
                      />

                      {loadingFiles ? (
                        <ActivityIndicator size="small" color="#00ff88" />
                      ) : (
                        <View style={styles.arrowIconContainer}>
                          <Svg width="38" height="38" viewBox="0 0 24 24">
                            <Path
                              d="M12 19V5M5 12l7-7 7 7"
                              fill="none"
                              stroke="#00ff88"
                              strokeWidth="2.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </Svg>
                        </View>
                      )}
                    </Pressable>
                  </View>
                </Animated.View>

                <Text
                  style={[
                    styles.neonStatusText,
                    bothFilesLoaded && styles.neonStatusTextActive,
                  ]}
                >
                  {bothFilesLoaded ? "LOADED" : "LOAD"}
                </Text>

                <Text style={styles.buttonHint}>
                  {bothFilesLoaded
                    ? "✓ Package ready in memory"
                    : "Click button to select folder"}
                </Text>

                <Pressable
                  style={styles.looseFilesLink}
                  onPress={() => triggerFolderUpload(false)}
                >
                  <Text style={styles.looseFilesLinkText}>
                    Or select loose files instead
                  </Text>
                </Pressable>
              </View>

              {fileError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠️ {fileError}</Text>
                </View>
              )}
            </View>

            {/* ---------------- CARD 2: AUTOMATED TEST EXECUTION ---------------- */}
            <View style={[styles.stationCard, isMobile && styles.stationCardMobile]}>
              <View style={styles.stepBadgeRow}>
                <View style={[styles.stepBadge, styles.stepBadgeGreen]}>
                  <Text style={[styles.stepBadgeText, styles.stepBadgeTextGreen]}>STEP 02</Text>
                </View>
              </View>

              {/* NEON CIRCULAR BUTTON WITH POWER LOGO (Reduced size + touch animation) */}
              <View style={styles.neonButtonContainer}>
                <Animated.View
                  style={[
                    styles.animatedWrapper,
                    {
                      transform: [
                        { scale: executeMutation.isPending ? pulseAnim : 1 },
                        { scale: testPressScale },
                      ],
                      opacity: executeMutation.isPending ? glowAnim : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.outerBezelRing,
                      executeMutation.isPending && styles.outerBezelRingTesting,
                    ]}
                  >
                    <Pressable
                      style={[
                        styles.neonButtonDisc,
                        executeMutation.isPending && styles.neonButtonDiscTesting,
                      ]}
                      onPressIn={handleTestPressIn}
                      onPressOut={handleTestPressOut}
                      onPress={() => executeMutation.mutate()}
                      disabled={executeMutation.isPending}
                    >
                      <View
                        style={[
                          styles.radialAura,
                          executeMutation.isPending && styles.radialAuraActive,
                        ]}
                      />

                      {executeMutation.isPending ? (
                        <ActivityIndicator size="small" color="#00ff88" />
                      ) : (
                        <View style={styles.arrowIconContainer}>
                          {/* Power Button Logo exactly matching uploaded screenshot */}
                          <Svg width="38" height="38" viewBox="0 0 24 24">
                            <Line
                              x1="12"
                              y1="2"
                              x2="12"
                              y2="12"
                              stroke="#00ff88"
                              strokeWidth="2.8"
                              strokeLinecap="round"
                            />
                            <Path
                              d="M18.36 6.64a9 9 0 1 1-12.73 0"
                              fill="none"
                              stroke="#00ff88"
                              strokeWidth="2.8"
                              strokeLinecap="round"
                            />
                          </Svg>
                        </View>
                      )}
                    </Pressable>
                  </View>
                </Animated.View>

                <Text
                  style={[
                    styles.neonStatusText,
                    executeMutation.isPending && styles.neonStatusTextActive,
                  ]}
                >
                  {executeMutation.isPending ? "TESTING" : "TEST"}
                </Text>

                <Text style={styles.buttonHint}>
                  {executeMutation.isPending
                    ? testingProgress || "Executing test stages on station..."
                    : "Click button to start automated test"}
                </Text>

                {/* Test Result Feedback Banner */}
                {lastTestResult && (
                  <View
                    style={[
                      styles.resultBanner,
                      lastTestResult.verdict === "PASS"
                        ? styles.resultPass
                        : styles.resultFail,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultBannerTitle}>
                        {lastTestResult.verdict === "PASS" ? "✓ TEST PASSED" : "✕ TEST FAILED"}
                      </Text>
                      <Text style={styles.resultBannerMeta}>
                        {lastTestResult.boardUid} • {lastTestResult.serial}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.viewResultButton}
                      onPress={() => setActiveTab("results")}
                    >
                      <Text style={styles.viewResultButtonText}>Results →</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* LOADED PACKAGE DETAILS */}
          {(programFile || jsonFile) && (
            <View style={styles.filesSection}>
              <View style={styles.filesSectionHeader}>
                <View>
                  <Text style={styles.filesSectionTitle}>Loaded Package Details</Text>
                  {folderName && (
                    <Text style={styles.folderNameText}>📁 Folder: {folderName}</Text>
                  )}
                </View>
                <Pressable style={styles.resetButton} onPress={handleResetFiles}>
                  <Text style={styles.resetButtonText}>✕ Clear & Re-upload</Text>
                </Pressable>
              </View>

              <View style={styles.filesGrid}>
                {/* Program File */}
                <View
                  style={[
                    styles.fileCard,
                    programFile ? styles.fileCardActive : styles.fileCardEmpty,
                  ]}
                >
                  <View style={styles.fileCardHeader}>
                    <Text style={styles.fileCardIcon}>💾</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileCardType}>1. PROGRAM FILE</Text>
                      <Text style={styles.fileCardStatus}>
                        {programFile ? "Ready in memory" : "Missing (.bin / .hex / .py)"}
                      </Text>
                    </View>
                    {programFile && <Text style={styles.badgeSuccess}>✓ LOADED</Text>}
                  </View>

                  {programFile && (
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName}>{programFile.name}</Text>
                      <Text style={styles.fileMeta}>
                        Size: {(programFile.size / 1024).toFixed(1)} KB
                      </Text>
                    </View>
                  )}
                </View>

                {/* JSON Config File */}
                <View
                  style={[
                    styles.fileCard,
                    jsonFile ? styles.fileCardActive : styles.fileCardEmpty,
                  ]}
                >
                  <View style={styles.fileCardHeader}>
                    <Text style={styles.fileCardIcon}>⚙️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileCardType}>2. CONFIGURATION FILE</Text>
                      <Text style={styles.fileCardStatus}>
                        {jsonFile
                          ? jsonFile.error
                            ? "Syntax error"
                            : "JSON parsed successfully"
                          : "Missing (.json)"}
                      </Text>
                    </View>
                    {jsonFile && !jsonFile.error && (
                      <Text style={styles.badgeSuccess}>✓ VALID JSON</Text>
                    )}
                  </View>

                  {jsonFile && (
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName}>{jsonFile.name}</Text>
                      <Text style={styles.fileMeta}>
                        Size: {(jsonFile.size / 1024).toFixed(1)} KB
                        {jsonFile.parsedJson &&
                          ` • ${Object.keys(jsonFile.parsedJson).length} root keys`}
                      </Text>

                      {jsonFile.parsedJson && (
                        <Pressable
                          style={styles.previewToggle}
                          onPress={() => setShowJsonPreview(!showJsonPreview)}
                        >
                          <Text style={styles.previewToggleText}>
                            {showJsonPreview ? "Hide JSON Content" : "Inspect JSON Content"}
                          </Text>
                        </Pressable>
                      )}

                      {showJsonPreview && jsonFile.rawContent && (
                        <View style={styles.jsonPreviewBox}>
                          <Text style={styles.jsonCodeText}>
                            {jsonFile.rawContent.slice(0, 500)}
                            {jsonFile.rawContent.length > 500 ? "\n..." : ""}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ================================================================= */}
      {/* TAB 3: CUSTOMER TEST RESULTS & STEP TELEMETRY */}
      {/* ================================================================= */}
      {activeTab === "results" && (
        <View style={styles.tabContent}>
          <View style={styles.resultsHeaderBox}>
            <Text style={styles.cardHeaderTitle}>Historical PCB Test Runs</Text>
            <Text style={styles.pageSubtitle}>
              Tested units for {dash?.customer?.name || "your account"}
            </Text>
          </View>

          {/* Search & Verdict Filter Bar */}
          <View style={styles.filterBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Board UID or Serial..."
              placeholderTextColor="#64748b"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <View style={styles.filterChips}>
              {["ALL", "PASS", "FAIL", "FIXTURE_FAULT"].map((v) => (
                <Pressable
                  key={v}
                  style={[styles.filterChip, verdictFilter === v && styles.filterChipActive]}
                  onPress={() => setVerdictFilter(v)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      verdictFilter === v && styles.filterChipTextActive,
                    ]}
                  >
                    {v}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Runs List */}
          {runsQuery.isLoading ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 32 }} />
          ) : runsQuery.data && runsQuery.data.length > 0 ? (
            <View style={{ gap: 8 }}>
              {runsQuery.data.map((run: any) => {
                const isExpanded = expandedRunId === run.id;
                const isPass = run.verdict === "PASS";

                return (
                  <View key={run.id} style={styles.resultCard}>
                    <Pressable
                      style={styles.resultCardHeader}
                      onPress={() => setExpandedRunId(isExpanded ? null : run.id)}
                    >
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={styles.resultCardUid}>{run.boardUid}</Text>
                          <View
                            style={[
                              styles.verdictBadge,
                              isPass ? styles.badgePass : styles.badgeFail,
                            ]}
                          >
                            <Text
                              style={[
                                styles.verdictBadgeText,
                                isPass ? styles.textPass : styles.textFail,
                              ]}
                            >
                              {run.verdict}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.resultCardMeta}>
                          Serial: {run.serial} • Variant: {run.variant} • Station: {run.stationId}
                        </Text>
                        <Text style={styles.resultCardDate}>
                          {new Date(run.startedAt).toLocaleString()} • Duration: {(run.durationMs / 1000).toFixed(1)}s
                        </Text>
                      </View>

                      <Text style={{ color: "#64748b", fontSize: 14 }}>
                        {isExpanded ? "▲" : "▼"}
                      </Text>
                    </Pressable>

                    {/* Expandable Test Steps Telemetry */}
                    {isExpanded && (
                      <View style={styles.stepsTelemetryBox}>
                        <Text style={styles.stepsTelemetryTitle}>Test Steps Telemetry:</Text>
                        {run.steps && run.steps.length > 0 ? (
                          run.steps.map((st: any) => (
                            <View key={st.id} style={styles.stepRow}>
                              <Text style={styles.stepName}>{st.block}</Text>
                              <Text style={styles.stepValue}>
                                {st.value} {st.unit}
                              </Text>
                              <View
                                style={[
                                  styles.stepVerdictMini,
                                  st.verdict === "PASS"
                                    ? styles.stepPassMini
                                    : styles.stepFailMini,
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "800",
                                    color: st.verdict === "PASS" ? "#4ade80" : "#f87171",
                                  }}
                                >
                                  {st.verdict}
                                </Text>
                              </View>
                            </View>
                          ))
                        ) : (
                          <Text style={{ color: "#8b949e", fontSize: 11, fontStyle: "italic" }}>
                            No individual steps logged.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyRunsBox}>
              <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center" }}>
                No test results match your filter.
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0c",
  },
  content: {
    padding: 16,
    gap: 16,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
  },

  // 1. Header Bar
  header: {
    backgroundColor: "#11141c",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e2433",
    gap: 12,
  },
  headerMobile: {
    padding: 10,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: 1.1,
  },
  customerBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  customerBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#e2e8f0",
  },
  signOutButton: {
    backgroundColor: "#182030",
    borderWidth: 1,
    borderColor: "#253147",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  signOutText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
  },

  // Full-width Segmented Tabs
  navTabs: {
    flexDirection: "row",
    backgroundColor: "#0a0d14",
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1e2433",
    width: "100%",
  },
  navTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  navTabActive: {
    backgroundColor: "#1e293b",
  },
  navTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },
  navTabTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },

  tabContent: {
    gap: 16,
  },
  pageSubtitle: {
    fontSize: 12,
    color: "#64748b",
  },

  // 2. Stat Cards Row (Responsive Grid)
  statCardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#11141c",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e2433",
    padding: 14,
    gap: 4,
  },
  statCardMobile: {
    minWidth: "47%",
    flexBasis: "47%",
  },
  statCardLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Highlight Card
  statCardHighlight: {
    borderColor: "rgba(16, 185, 129, 0.4)",
    backgroundColor: "#081c15",
  },
  statCardHighlightLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#34d399",
  },
  statCardHighlightValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  statCardHighlightSub: {
    fontSize: 10,
    fontWeight: "600",
    color: "#10b981",
  },

  // 3. Chart & Breakdown
  chartAndBreakdownRow: {
    flexDirection: "row",
    gap: 14,
  },
  chartAndBreakdownMobile: {
    flexDirection: "column",
  },
  chartCard: {
    flex: 2,
    backgroundColor: "#11141c",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e2433",
    padding: 16,
    gap: 6,
  },
  chartCardMobile: {
    width: "100%",
  },
  breakdownCard: {
    flex: 1,
    backgroundColor: "#11141c",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e2433",
    padding: 16,
    gap: 6,
  },
  breakdownCardMobile: {
    width: "100%",
  },
  cardHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#cbd5e1",
  },
  svgChartWrapper: {
    marginTop: 6,
    width: "100%",
  },

  // Progress Bars
  breakdownRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#e2e8f0",
  },
  breakdownCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
  },
  progressBarTrack: {
    height: 5,
    width: "100%",
    backgroundColor: "#1e293b",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 3,
  },

  // Loading & Error States
  loadingContainer: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: "rgba(220, 38, 38, 0.15)",
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 12,
    padding: 16,
    gap: 6,
    alignItems: "center",
  },
  errorTitle: {
    color: "#fca5a5",
    fontSize: 14,
    fontWeight: "700",
  },
  errorSubtitle: {
    color: "#f87171",
    fontSize: 11,
    textAlign: "center",
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 12,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#dc2626",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Test Station Workspace Cards (Separated Dual Layout)
  stationCardsRow: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
    alignItems: "stretch",
  },
  stationCardsRowMobile: {
    flexDirection: "column",
  },
  stationCard: {
    flex: 1,
    backgroundColor: "#11141c",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e2433",
    padding: 18,
    alignItems: "center",
    justifyContent: "space-between",
  },
  stationCardMobile: {
    width: "100%",
  },
  stepBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    marginBottom: 6,
  },
  stepBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stepBadgeGreen: {
    backgroundColor: "rgba(0, 255, 136, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 136, 0.3)",
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 1,
  },
  stepBadgeTextGreen: {
    color: "#00ff88",
  },
  stepCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f0f6fc",
  },
  stepCardSubtitle: {
    fontSize: 12,
    color: "#8b949e",
    lineHeight: 17,
    width: "100%",
    marginBottom: 10,
  },

  // Neon Circular Button (Reduced Size + Responsive)
  neonButtonContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  animatedWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  outerBezelRing: {
    width: 154,
    height: 154,
    borderRadius: 77,
    borderWidth: 2,
    borderColor: "#152438",
    backgroundColor: "#0a101b",
    alignItems: "center",
    justifyContent: "center",
  },
  outerBezelRingTesting: {
    borderColor: "#00ff88",
  },
  neonButtonDisc: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: "#091219",
    borderWidth: 3,
    borderColor: "#00ff88",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    cursor: "pointer" as any,
  },
  neonButtonDiscActive: {
    borderColor: "#00ff88",
    backgroundColor: "#061817",
  },
  neonButtonDiscTesting: {
    borderColor: "#00ff88",
    backgroundColor: "#061817",
  },
  neonButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  radialAura: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0, 255, 136, 0.12)",
  },
  radialAuraActive: {
    backgroundColor: "rgba(0, 255, 136, 0.24)",
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  arrowIconContainer: {
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  neonStatusText: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 4,
    color: "#00ff88",
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
  },
  neonStatusTextActive: {
    color: "#00ff88",
  },
  buttonHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#8b949e",
    textAlign: "center",
  },
  looseFilesLink: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  looseFilesLinkText: {
    fontSize: 11,
    color: "#64748b",
    textDecorationLine: "underline",
  },

  // Execution Box
  executionBox: {
    width: "100%",
    maxWidth: 420,
    gap: 10,
    marginTop: 4,
    alignItems: "center",
  },
  startTestButton: {
    backgroundColor: "#00ff88",
    width: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  startTestButtonDisabled: {
    opacity: 0.6,
  },
  startTestButtonText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 6,
  },
  progressText: {
    color: "#00ff88",
    fontSize: 11,
    fontWeight: "600",
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  resultPass: {
    backgroundColor: "#064e3b",
    borderColor: "#059669",
  },
  resultFail: {
    backgroundColor: "#450a0a",
    borderColor: "#b91c1c",
  },
  resultBannerTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  resultBannerMeta: {
    color: "#d1d5db",
    fontSize: 11,
    marginTop: 2,
  },
  viewResultButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  viewResultButtonText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },

  // Loaded Details Section
  filesSection: {
    backgroundColor: "#11141c",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e2433",
    padding: 14,
    gap: 10,
  },
  filesSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filesSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f0f6fc",
  },
  folderNameText: {
    fontSize: 11,
    color: "#00ff88",
    marginTop: 2,
    fontWeight: "600",
  },
  resetButton: {
    backgroundColor: "#1e1313",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  resetButtonText: {
    color: "#f87171",
    fontSize: 10,
    fontWeight: "600",
  },
  filesGrid: {
    gap: 8,
  },
  fileCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  fileCardActive: {
    backgroundColor: "#0d1017",
    borderColor: "#1e2433",
  },
  fileCardEmpty: {
    backgroundColor: "#090c12",
    borderColor: "#171c28",
    borderStyle: "dashed",
  },
  fileCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fileCardIcon: {
    fontSize: 16,
  },
  fileCardType: {
    fontSize: 11,
    fontWeight: "700",
    color: "#f0f6fc",
  },
  fileCardStatus: {
    fontSize: 10,
    color: "#8b949e",
  },
  badgeSuccess: {
    backgroundColor: "#064e3b",
    color: "#34d399",
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileDetails: {
    backgroundColor: "#080c14",
    borderRadius: 6,
    padding: 6,
    gap: 2,
  },
  fileName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#38bdf8",
  },
  fileMeta: {
    fontSize: 10,
    color: "#8b949e",
  },
  previewToggle: {
    marginTop: 3,
    alignSelf: "flex-start",
  },
  previewToggleText: {
    color: "#00ff88",
    fontSize: 10,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  jsonPreviewBox: {
    marginTop: 4,
    backgroundColor: "#030712",
    borderRadius: 6,
    padding: 6,
    maxHeight: 100,
    overflow: "hidden",
  },
  jsonCodeText: {
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
    fontSize: 9,
    color: "#a5b4fc",
  },

  // Results Tab Styles
  resultsHeaderBox: {
    gap: 2,
  },
  filterBar: {
    gap: 8,
  },
  searchInput: {
    backgroundColor: "#11141c",
    borderWidth: 1,
    borderColor: "#1e2433",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#f0f6fc",
    fontSize: 12,
  },
  filterChips: {
    flexDirection: "row",
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#162032",
    borderWidth: 1,
    borderColor: "#25334a",
  },
  filterChipActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
  },
  filterChipTextActive: {
    color: "#ffffff",
  },

  // Result Card
  resultCard: {
    backgroundColor: "#11141c",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e2433",
    padding: 12,
  },
  resultCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  resultCardUid: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f0f6fc",
  },
  resultCardMeta: {
    fontSize: 10,
    color: "#8b949e",
  },
  resultCardDate: {
    fontSize: 9,
    color: "#64748b",
  },

  // Verdict Badges
  verdictBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgePass: {
    backgroundColor: "#064e3b",
  },
  badgeFail: {
    backgroundColor: "#450a0a",
  },
  verdictBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  textPass: {
    color: "#34d399",
  },
  textFail: {
    color: "#f87171",
  },

  // Step Telemetry
  stepsTelemetryBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1e2433",
    gap: 5,
  },
  stepsTelemetryTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 2,
  },
  stepRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0b0e14",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
  },
  stepName: {
    fontSize: 10,
    fontWeight: "600",
    color: "#e2e8f0",
  },
  stepValue: {
    fontSize: 10,
    color: "#94a3b8",
  },
  stepVerdictMini: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  stepPassMini: {
    backgroundColor: "#064e3b",
  },
  stepFailMini: {
    backgroundColor: "#450a0a",
  },

  emptyRunsBox: {
    paddingVertical: 24,
    alignItems: "center",
  },
});
