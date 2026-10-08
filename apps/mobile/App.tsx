import "./global.css";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { qk, queryDefaults } from "@receipt-vault/shared";
import type { Session } from "@receipt-vault/firebase";
import { createVaultClient } from "@receipt-vault/firebase";
import { authClient } from "./lib/auth-client";
import {
  formatMoney,
  receiptSchema,
  scanSchema,
  today,
  type Category,
  type Receipt,
  type ReceiptInput,
  type ScanResult,
} from "@receipt-vault/shared";
const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
const client = apiBase
  ? createVaultClient(authClient, apiBase, async () => ({
      Cookie: await authClient.getCookie(),
      Origin: "receiptvault://",
    }))
  : null;

function Action({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-xl p-4 my-1 ${secondary ? "bg-stone-200 dark:bg-stone-700" : "bg-primary"} ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-center font-semibold ${secondary ? "text-stone-800 dark:text-white" : "text-white"}`}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export default function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: queryDefaults } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Main />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
function Main() {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [category, setCategory] = useState("");
  const [editor, setEditor] = useState<Receipt | null | undefined>(undefined);
  const [detail, setDetail] = useState<Receipt | null>(null);
  const activeUid = useRef<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    return client.auth.watch((s) => {
      setSession(s);
      setLoading(false);
      if (activeUid.current !== (s?.user.id ?? null)) {
        cache.clear();
        setDetail(null);
        setEditor(undefined);
        activeUid.current = s?.user.id ?? null;
      }
    });
  }, [cache]);
  const uid = session?.user.id ?? "";
  const filters = {
    q: debouncedSearch || undefined,
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined,
    categoryId: category || undefined,
  };
  const receipts = useInfiniteQuery({
    queryKey: qk.list(uid, filters),
    enabled: !!session,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client!.listReceipts(filters, pageParam),
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });
  const categories = useQuery({
    queryKey: qk.categories(uid),
    enabled: !!session,
    queryFn: () => client!.listCategories(),
    staleTime: 3_600_000,
  });
  const photoQuery = useQuery({
    queryKey: qk.photo(uid, detail?.id ?? ""),
    enabled: !!session && !!detail?.image_path,
    queryFn: () => client!.photoUrl(detail!.id),
    staleTime: 240_000,
    gcTime: 240_000,
  });
  const photo = photoQuery.data ?? "";
  const photoError = photoQuery.error
    ? "Could not load the photo. Reopen this receipt to retry."
    : "";
  const rows = receipts.data?.pages.flatMap((page) => page.data) ?? [];
  async function remove(r: Receipt) {
    try {
      await client!.deleteReceipt(r.id);
    } catch {
      Alert.alert("Could not delete the receipt", "Please try again.");
      return;
    }
    setDetail(null);
    await cache.invalidateQueries({ queryKey: qk.receipts(uid) });
  }
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-stone-950">
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 45 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-primary dark:text-green-300 text-2xl font-bold mb-7">
          ▤ ReceiptVault.
        </Text>
        {loading ? (
          <ActivityIndicator />
        ) : !client ? (
          <>
            <Text className="text-2xl dark:text-white mb-4">
              Connect your vault
            </Text>
            <Text className="text-stone-600 dark:text-stone-300">
              Set the web API URL in apps/mobile/.env to start saving receipts.
            </Text>
          </>
        ) : !session ? (
          <>
            <Text className="text-3xl dark:text-white mb-3">
              {signup ? "A fresh start." : "Welcome back."}
            </Text>
            <Text className="text-stone-500 mb-6">
              Your receipts, all together.
            </Text>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {!!message && (
              <Text accessibilityRole="alert" className="text-amber-700 my-3">
                {message}
              </Text>
            )}
            <Action
              title={
                authBusy ? "One moment…" : signup ? "Create account" : "Log in"
              }
              disabled={authBusy}
              onPress={async () => {
                setAuthBusy(true);
                setMessage("");
                try {
                  const { error } = signup
                    ? await client.auth.signUp({ email, password })
                    : await client.auth.signInWithPassword({ email, password });
                  if (error) setMessage(error.message);
                  else if (signup) setMessage("Your account is ready.");
                } catch {
                  setMessage("Could not connect. Please try again.");
                } finally {
                  setAuthBusy(false);
                }
              }}
            />
            <Action
              secondary
              title={
                signup ? "Already registered? Log in" : "Create an account"
              }
              onPress={() => setSignup(!signup)}
            />
          </>
        ) : (
          <>
            <View className="flex-row justify-between items-center">
              <Text className="text-3xl text-stone-800 dark:text-white font-semibold">
                Your receipts.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  const { error } = await client.auth.signOut();
                  if (error)
                    Alert.alert("Could not sign out", "Please try again.");
                }}
              >
                <Text className="text-stone-500">Sign out</Text>
              </Pressable>
            </View>
            <Text className="text-stone-500 mt-2 mb-6">
              Less paper. More peace of mind.
            </Text>
            <Action
              title="+ Add or scan a receipt"
              onPress={() => setEditor(null)}
            />
            <Field
              label="Search by store"
              maxLength={120}
              value={search}
              onChangeText={setSearch}
            />
            <Field
              label="Month (YYYY-MM) · leave blank for all"
              value={month}
              onChangeText={setMonth}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="my-3"
            >
              <Pressable
                onPress={() => setCategory("")}
                className="mr-2 p-3 bg-stone-200 dark:bg-stone-700 rounded-full"
              >
                <Text className="dark:text-white">
                  {!category ? "✓ " : ""}All
                </Text>
              </Pressable>
              {categories.data?.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  className="mr-2 p-3 bg-stone-200 dark:bg-stone-700 rounded-full"
                >
                  <Text className="dark:text-white">
                    {category === c.id ? "✓ " : ""}
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {(receipts.isLoading || categories.isLoading) && (
              <ActivityIndicator />
            )}
            {(receipts.error || categories.error) && (
              <Action
                secondary
                title="Couldn't load your vault. Tap to retry"
                onPress={() => {
                  void receipts.refetch();
                  void categories.refetch();
                }}
              />
            )}
            {!rows.length && !receipts.isLoading && (
              <Text className="text-stone-500 text-center my-12">
                {rows.length
                  ? "No matching receipts. Try another filter."
                  : "Add your first receipt to start your collection."}
              </Text>
            )}
            {rows.map((r, i) => (
              <View key={r.id}>
                {(i === 0 || rows[i - 1].purchase_date !== r.purchase_date) && (
                  <Text className="text-stone-500 text-xs mt-5 mb-2">
                    {r.purchase_date === today() ? "Today" : r.purchase_date}
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDetail(r)}
                  className="p-5 bg-white dark:bg-stone-900 rounded-xl mb-2 border border-stone-200 dark:border-stone-800"
                >
                  <View className="flex-row justify-between gap-2">
                    <Text className="font-semibold text-stone-800 dark:text-white flex-1">
                      {r.merchant}
                    </Text>
                    <Text className="text-primary dark:text-green-300">
                      {formatMoney(Number(r.total_amount), r.currency)}
                    </Text>
                  </View>
                  <Text className="text-stone-400 text-xs mt-2">
                    {categories.data?.find((c) => c.id === r.category_id)
                      ?.name ?? "Other"}{" "}
                    · {r.payment_method || "Receipt"}
                  </Text>
                </Pressable>
              </View>
            ))}
            {receipts.hasNextPage && (
              <Action
                title={
                  receipts.isFetchingNextPage
                    ? "Loading…"
                    : "Load more receipts"
                }
                disabled={receipts.isFetchingNextPage}
                onPress={() => void receipts.fetchNextPage()}
              />
            )}
            <Text
              className="text-stone-500 mt-6"
              onPress={() => void Linking.openURL(`${apiBase}/privacy`)}
            >
              Privacy: photos are sent to Google Gemini when scanning. Tap for
              details.
            </Text>
            <Field
              label="Password to delete your account"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
            />
            <Action
              secondary
              title={
                deletingAccount
                  ? "Deleting account…"
                  : "Delete account and all data"
              }
              disabled={!deletePassword || deletingAccount}
              onPress={() =>
                Alert.alert(
                  "Delete account?",
                  "This permanently removes your receipts, photos, and account.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        setDeletingAccount(true);
                        const { error } =
                          await client!.auth.deleteAccount(deletePassword);
                        setDeletePassword("");
                        setDeletingAccount(false);
                        if (error)
                          Alert.alert(
                            "Could not delete account",
                            error.message,
                          );
                      },
                    },
                  ],
                )
              }
            />
          </>
        )}
      </ScrollView>
      <Modal
        visible={editor !== undefined}
        animationType="slide"
        onRequestClose={() => setEditor(undefined)}
      >
        {editor !== undefined && session && (
          <SafeAreaView className="flex-1 bg-background dark:bg-stone-950">
            <ScrollView
              contentContainerStyle={{ padding: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Action
                secondary
                title="Close"
                onPress={() => setEditor(undefined)}
              />
              <Editor
                receipt={editor}
                userId={session.user.id}
                cats={categories.data ?? []}
                onSaved={async () => {
                  await cache.invalidateQueries({ queryKey: qk.receipts(uid) });
                  setEditor(undefined);
                }}
              />
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
      <Modal
        visible={!!detail}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <SafeAreaView className="flex-1 bg-background dark:bg-stone-950">
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            {detail && (
              <>
                <Action
                  secondary
                  title="Close"
                  onPress={() => setDetail(null)}
                />
                <Text className="text-3xl font-semibold dark:text-white my-5">
                  {detail.merchant}
                </Text>
                {photo ? (
                  <Image
                    source={{ uri: photo }}
                    style={{ width: "100%", height: 340 }}
                    resizeMode="contain"
                  />
                ) : (
                  <Text className="text-stone-500 text-center my-10">
                    {photoError ||
                      (detail.image_path
                        ? "Loading photo…"
                        : "No photo attached")}
                  </Text>
                )}
                <Text className="text-3xl text-primary dark:text-green-300 my-5">
                  {formatMoney(Number(detail.total_amount), detail.currency)}
                </Text>
                <Text className="text-stone-500 mb-4">
                  {detail.purchase_date} ·{" "}
                  {detail.payment_method || "Payment not specified"}
                </Text>
                <Text className="dark:text-white mb-5">
                  {detail.notes || "No notes"}
                </Text>
                <Action
                  title="Edit receipt"
                  onPress={() => {
                    setEditor(detail);
                    setDetail(null);
                  }}
                />
                <Action
                  secondary
                  title="Delete receipt"
                  onPress={() =>
                    Alert.alert(
                      "Delete receipt?",
                      "This removes the saved receipt and its photo.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => void remove(detail),
                        },
                      ],
                    )
                  }
                />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const dark = useColorScheme() === "dark";
  return (
    <View className="my-2">
      <Text className="text-stone-600 dark:text-stone-300 text-xs mb-2">
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        autoCapitalize="none"
        placeholderTextColor="#999"
        style={{ color: dark ? "#fff" : "#243b32" }}
        className="border border-stone-300 dark:border-stone-700 rounded-xl p-4 bg-white dark:bg-stone-900"
      />
    </View>
  );
}
function Editor({
  receipt,
  userId,
  cats,
  onSaved,
}: {
  receipt: Receipt | null;
  userId: string;
  cats: Category[];
  onSaved: () => Promise<void>;
}) {
  const [id] = useState(() => receipt?.id ?? Crypto.randomUUID());
  const [image, setImage] = useState("");
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [path, setPath] = useState(receipt?.image_path ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(
    receipt?.scan_raw ?? null,
  );
  const [status, setStatus] = useState<Receipt["scan_status"]>(
    receipt?.scan_status ?? "manual",
  );
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReceiptInput>({
    resolver: zodResolver(receiptSchema),
    defaultValues: receipt
      ? {
          merchant: receipt.merchant,
          purchase_date: receipt.purchase_date,
          total_amount: receipt.total_amount,
          currency: receipt.currency,
          category_id: receipt.category_id,
          payment_method: receipt.payment_method,
          notes: receipt.notes,
        }
      : {
          merchant: "",
          purchase_date: today(),
          total_amount: undefined,
          currency: "PHP",
          category_id: null,
          payment_method: "",
          notes: "",
        },
  });
  const uploading = useRef(false);
  async function upload(data: ArrayBuffer) {
    if (uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setError("");
    const imagePath = `${userId}/${id}.jpg`;
    try {
      if (!path) {
        await client!.uploadPhoto(imagePath, data);
        setPath(imagePath);
      }
      try {
        const base = process.env.EXPO_PUBLIC_API_BASE_URL;
        if (!base)
          throw new Error(
            "Scan server is not configured. Enter details manually.",
          );
        const result = scanSchema.parse(await client!.scan(id, imagePath));
        setScan(result);
        setStatus("scanned");
        setValue("merchant", result.merchant);
        setValue("purchase_date", result.purchaseDate ?? today());
        if (result.total !== null) setValue("total_amount", result.total);
        else
          setError(
            "We filled in the readable details, but could not read the total. Enter the amount from your receipt before saving.",
          );
        setValue("currency", result.currency);
        setValue(
          "category_id",
          cats.find((c) => c.name.toLowerCase() === result.category)?.id ??
            null,
        );
      } catch (e) {
        setStatus("failed");
        setError(
          e instanceof Error
            ? e.message
            : "Could not read that receipt. Enter details manually.",
        );
      }
    } catch {
      setError("Upload failed. Your photo is still here. Tap retry.");
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }
  const picking = useRef(false);
  async function pick(camera: boolean) {
    if (picking.current || uploading.current || busy || path || isSubmitting)
      return;
    picking.current = true;
    setError("");
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          "Photo access is needed. Allow it in your phone settings, or enter details manually.",
        );
        return;
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
          });
      if (result.canceled) return;
      setBusy(true);
      const asset = result.assets[0];
      const transformed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          {
            resize:
              asset.width >= asset.height
                ? { width: Math.min(1600, asset.width) }
                : { height: Math.min(1600, asset.height) },
          },
        ],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );
      setImage(transformed.uri);
      const data = await (await fetch(transformed.uri)).arrayBuffer();
      setBytes(data);
      await upload(data);
    } catch {
      setError(
        "Could not prepare the photo. Try another image or enter details manually.",
      );
    } finally {
      picking.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Text className="text-3xl dark:text-white my-5">
        {receipt ? "Edit receipt" : "Review your receipt"}
      </Text>
      {!receipt && (
        <Text
          className="text-stone-500 text-xs mb-3"
          onPress={() => void Linking.openURL(`${apiBase}/privacy`)}
        >
          Scanning sends this photo to Google Gemini. Tap for privacy details.
          Review before saving.
        </Text>
      )}
      {!receipt && !path && (
        <View>
          <Action
            title="Take a photo"
            disabled={busy}
            onPress={() => pick(true)}
          />
          <Action
            secondary
            title="Choose from gallery"
            disabled={busy}
            onPress={() => pick(false)}
          />
        </View>
      )}
      {!!image && (
        <Image
          source={{ uri: image }}
          style={{ height: 160, width: "100%", marginVertical: 16 }}
          resizeMode="contain"
        />
      )}
      {busy && (
        <View className="my-4">
          <ActivityIndicator />
          <Text className="text-stone-500 text-center mt-2">
            Reading receipt…
          </Text>
        </View>
      )}
      {!!error && (
        <Text accessibilityRole="alert" className="text-amber-700 my-4">
          {error}
        </Text>
      )}
      {!!error && !!bytes && !busy && (
        <Action
          secondary
          title={path ? "Retry scan" : "Retry upload"}
          onPress={() => upload(bytes)}
        />
      )}{" "}
      {scan && scan.confidence < 0.8 && (
        <Text className="text-amber-700 my-3">
          Please double-check these details; the photo was hard to read.
        </Text>
      )}
      {(
        [
          { name: "merchant", label: "Store name" },
          { name: "purchase_date", label: "Purchase date (YYYY-MM-DD)" },
          { name: "total_amount", label: "Total" },
          { name: "currency", label: "Currency (PHP, USD, EUR…)" },
          { name: "payment_method", label: "Payment method" },
          { name: "notes", label: "Notes" },
        ] as const
      ).map(({ name, label }) => (
        <View
          key={name}
          className={
            scan && scan.confidence < 0.8
              ? "border-l-2 border-amber-300 pl-2"
              : ""
          }
        >
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <Field
                label={label}
                value={field.value === undefined ? "" : String(field.value)}
                onChangeText={(v) =>
                  field.onChange(
                    name === "total_amount"
                      ? v === ""
                        ? NaN
                        : Number(v)
                      : name === "currency"
                        ? v.toUpperCase()
                        : v,
                  )
                }
                keyboardType={
                  name === "total_amount" ? "decimal-pad" : "default"
                }
              />
            )}
          />
          {errors[name] && (
            <Text className="text-red-600 text-xs">
              {errors[name]?.message}
            </Text>
          )}
        </View>
      ))}
      <Text className="text-stone-500 mt-4 mb-2">Category</Text>
      <Controller
        control={control}
        name="category_id"
        render={({ field }) => (
          <View className="flex-row flex-wrap">
            {[{ id: null, name: "Uncategorized" }, ...cats].map((c) => (
              <Pressable
                key={c.id ?? "none"}
                onPress={() => field.onChange(c.id)}
                className={`p-3 rounded-full mr-2 mb-2 ${field.value === c.id ? "bg-primary" : "bg-stone-200 dark:bg-stone-700"}`}
              >
                <Text
                  className={
                    field.value === c.id
                      ? "text-white"
                      : "text-stone-700 dark:text-white"
                  }
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
      <Action
        title={isSubmitting ? "Saving…" : "Save receipt"}
        disabled={busy || isSubmitting}
        onPress={handleSubmit(async (values) => {
          setError("");
          try {
            const row: Receipt = {
              ...values,
              id,
              user_id: userId,
              image_path: path,
              scan_status: status,
              scan_raw: scan,
              created_at: receipt?.created_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            await client!.saveReceipt(row, !!receipt);
            await onSaved();
          } catch {
            setError("Could not save. Check your connection and try again.");
          }
        })}
      />
    </>
  );
}
