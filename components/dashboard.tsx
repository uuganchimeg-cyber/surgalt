"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  signInWithCustomToken,
  signOut,
} from "@firebase/auth";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Icon } from "./icons";
import { MathLoader } from "./math-loader";
import {
  announcementCategories,
  type Announcement,
  type AnnouncementCategory,
} from "./management-page";
import { ProgressButton, ProgressForm } from "./action-progress";
import type {
  HomeworkAssignment,
  HomeworkSubmission,
  NewHomeworkAssignment,
} from "./homework-data";
import type { GradeExam, GradeStudentSave } from "./grade-data";
import type {
  AttendanceRecords,
  AttendanceStatus,
} from "./attendance-data";
import { navigation } from "./school-data";
import type { PageId, Student } from "./school-data";
import type { HomeworkSection } from "./homework-data";
import type { DashboardNotification } from "./notification-data";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { uploadImage, uploadProfileImage } from "@/lib/cloudinary-client";
import { ProfileAvatar } from "./profile-avatar";
import { StyledSelect } from "./styled-select";

const ManagementPage = dynamic(
  () => import("./management-page").then((module) => module.ManagementPage),
  {
    loading: () => <MathLoader label="Удирдлагын хэсэг ачаалж байна" />,
  },
);
const Overview = dynamic(
  () => import("./overview").then((module) => module.Overview),
  {
    loading: () => <MathLoader label="Тойм мэдээлэл ачаалж байна" />,
  },
);
const StudentOverview = dynamic(
  () => import("./overview").then((module) => module.StudentOverview),
  {
    loading: () => <MathLoader label="Таны мэдээлэл ачаалж байна" />,
  },
);
const DataManagementPage = dynamic(
  () =>
    import("./data-management-page").then(
      (module) => module.DataManagementPage,
    ),
  {
    loading: () => <MathLoader label="Өгөгдлийн хэсэг ачаалж байна" />,
  },
);

type LoginSession =
  | { role: "teacher" }
  | { role: "student"; studentId: number };

type AccountProfile = {
  name: string;
  username: string;
  profileImageUrl: string | null;
  profileImagePublicId: string | null;
};

type AccountProfilePatch = {
  name?: string;
  username?: string;
  currentPin?: string;
  newPin?: string;
  profileImagePublicId?: string | null;
};

type AccountProfileChanges =
  | AccountProfilePatch
  | (() => Promise<AccountProfilePatch>);
type ProfileSaveTarget = "image" | "name" | "username" | "pin";

type DashboardData = {
  students: Student[];
  attendanceRecords: AttendanceRecords;
  gradeExams: GradeExam[];
  gradeExamNames: string[];
  homeworkAssignments: HomeworkAssignment[];
  homeworkSubmissions: HomeworkSubmission[];
  announcements: Announcement[];
  notifications: DashboardNotification[];
};

async function responseError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return body.error ?? "Сервертэй холбогдоход алдаа гарлаа.";
}

function getMongoliaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getTodayKey() {
  return getMongoliaDateKey(new Date());
}

function getNotificationDateKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : getMongoliaDateKey(date);
}

function getGreeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ulaanbaatar",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour >= 6 && hour < 12) return "Өглөөний мэнд";
  if (hour >= 12 && hour < 18) return "Өдрийн мэнд";
  if (hour >= 18 && hour < 22) return "Оройн мэнд";
  return "Шөнийн мэнд";
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("mn-MN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("erdem-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("erdem-theme-change", onChange);
  };
}

function getThemeSnapshot(): "light" | "dark" {
  return window.localStorage.getItem("erdem-theme") === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot(): "light" | "dark" {
  return "light";
}

export function Dashboard() {
  const [session, setSession] = useState<LoginSession | null>(null);
  const [activePage, setActivePage] = useState<PageId>("overview");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [students, setStudents] = useState<Student[]>([]);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavingTarget, setProfileSavingTarget] =
    useState<ProfileSaveTarget | null>(null);
  const [profileError, setProfileError] = useState("");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [profileImagePublicId, setProfileImagePublicId] = useState<string | null>(null);
  const [attendanceRecords, setAttendanceRecords] =
    useState<AttendanceRecords>({});
  const [homeworkAssignments, setHomeworkAssignments] = useState<
    HomeworkAssignment[]
  >([]);
  const [homeworkSubmissions, setHomeworkSubmissions] = useState<
    HomeworkSubmission[]
  >([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [homeworkSectionToOpen, setHomeworkSectionToOpen] =
    useState<HomeworkSection | null>(null);
  const [homeworkSectionRequest, setHomeworkSectionRequest] = useState(0);
  const [homeworkSubmissionToFocus, setHomeworkSubmissionToFocus] =
    useState<string | null>(null);
  const [homeworkSubmissionFocusRequest, setHomeworkSubmissionFocusRequest] =
    useState(0);
  const [announcementImage, setAnnouncementImage] = useState<File | null>(null);
  const [announcementImagePreview, setAnnouncementImagePreview] = useState<
    string | null
  >(null);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [gradeExams, setGradeExams] = useState<GradeExam[]>([]);
  const [gradeExamNames, setGradeExamNames] = useState<string[]>([]);
  const [modal, setModal] = useState<
    "student" | "edit-student" | "announcement" | "edit-announcement" | null
  >(null);
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [studentFormError, setStudentFormError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [backendError, setBackendError] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileSaveBusyRef = useRef(false);
  const pendingNotificationSoundsRef = useRef(0);
  const notificationBaselineRef = useRef<{
    sessionKey: string;
    ids: Set<string>;
  } | null>(null);
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const markNotificationsAsRead = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) =>
        idSet.has(notification.id) && !notification.readAt
          ? { ...notification, readAt }
          : notification,
      ),
    );
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
    }).catch((error: unknown) => {
      setToast(
        error instanceof Error
          ? error.message
          : "Мэдэгдлийн төлөв шинэчилж чадсангүй.",
      );
    });
  }, []);

  function getAudioContext() {
    const audioContext =
      audioContextRef.current ?? new window.AudioContext();
    audioContextRef.current = audioContext;
    return audioContext;
  }

  function playScheduledChimes(count: number) {
    if (count <= 0) return;
    const audioContext = getAudioContext();
    const firstStart = audioContext.currentTime;
    for (let chime = 0; chime < count; chime += 1) {
      const startAt = firstStart + chime * 0.35;
      [660, 880].forEach((frequency, index) => {
        const start = startAt + index * 0.12;
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(0.0001, start);
        volume.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        oscillator.connect(volume);
        volume.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.19);
      });
    }
  }

  function flushPendingNotificationSounds() {
    const count = pendingNotificationSoundsRef.current;
    pendingNotificationSoundsRef.current = 0;
    playScheduledChimes(count);
  }

  function playNotificationSounds(count: number) {
    const audioContext = getAudioContext();
    if (audioContext.state === "suspended") {
      pendingNotificationSoundsRef.current += count;
      void audioContext
        .resume()
        .then(flushPendingNotificationSounds)
        .catch(() => {});
      return;
    }
    playScheduledChimes(count);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        profileMenuRef.current?.querySelector<HTMLButtonElement>(".profile-trigger")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) throw new Error(await responseError(response));
        const body = (await response.json()) as {
          session: LoginSession | null;
        };
        if (!active) return;
        setSession(body.session);
        if (body.session) {
          setDataLoading(true);
          const [dataResponse, profileResponse] = await Promise.all([
            fetch("/api/data"),
            fetch("/api/profile", { cache: "no-store" }),
          ]);
          if (!dataResponse.ok) {
            throw new Error(await responseError(dataResponse));
          }
          if (!profileResponse.ok) {
            throw new Error(await responseError(profileResponse));
          }
          const data = (await dataResponse.json()) as DashboardData;
          const profileBody = (await profileResponse.json()) as {
            profile: AccountProfile;
          };
          if (active) {
            setStudents(data.students);
            setAttendanceRecords(data.attendanceRecords);
            setGradeExams(data.gradeExams);
            setGradeExamNames(data.gradeExamNames);
            setHomeworkAssignments(data.homeworkAssignments);
            setHomeworkSubmissions(data.homeworkSubmissions);
            setAnnouncements(data.announcements);
            setNotifications(data.notifications ?? []);
            setAccountProfile(profileBody.profile);
          }
        }
      } catch (error) {
        if (active) {
          setBackendError(
            error instanceof Error
              ? error.message
              : "Сургалтын системтэй холбогдож чадсангүй.",
          );
        }
      } finally {
        if (active) {
          setInitializing(false);
          setDataLoading(false);
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function unlockSound() {
      const audioContext = getAudioContext();
      if (audioContext.state === "suspended") {
        void audioContext
          .resume()
          .then(flushPendingNotificationSounds)
          .catch(() => {});
      } else {
        flushPendingNotificationSounds();
      }
    }

    window.addEventListener("pointerdown", unlockSound, { once: true });
    window.addEventListener("keydown", unlockSound, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      notificationBaselineRef.current = null;
      return;
    }
    if (dataLoading) return;

    const sessionKey =
      session.role === "teacher" ? "teacher" : `student:${session.studentId}`;
    const ids = new Set(notifications.map((notification) => notification.id));
    const previous = notificationBaselineRef.current;
    if (!previous || previous.sessionKey !== sessionKey) {
      notificationBaselineRef.current = { sessionKey, ids };
      return;
    }

    const newlyReceived = notifications.filter(
      (notification) => !previous.ids.has(notification.id),
    );
    notificationBaselineRef.current = { sessionKey, ids };
    if (!newlyReceived.length) return;

    playNotificationSounds(newlyReceived.length);
  }, [dataLoading, notifications, session]);

  useEffect(() => {
    if (!session || dataLoading) return;
    let active = true;
    const refreshNotifications = async () => {
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          notifications: DashboardNotification[];
        };
        if (active) setNotifications(body.notifications);
      } catch {
        // Keep the dashboard usable while the notification endpoint reconnects.
      }
    };

    void refreshNotifications();
    const timer = window.setInterval(() => void refreshNotifications(), 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [dataLoading, session]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const todayKey = getTodayKey();
    const unreadIds = notifications
      .filter(
        (notification) =>
          !notification.readAt &&
          (showAllNotifications || getNotificationDateKey(notification.createdAt) === todayKey),
      )
      .map((notification) => notification.id);
    if (unreadIds.length) markNotificationsAsRead(unreadIds);
  }, [markNotificationsAsRead, notifications, notificationsOpen, showAllNotifications]);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    window.localStorage.setItem("erdem-theme", nextTheme);
    window.dispatchEvent(new Event("erdem-theme-change"));
  }

  function navigate(page: PageId, refreshData = false) {
    setProfileMenuOpen(false);
    setActivePage(page);
    if (page !== "homework") setHomeworkSectionToOpen(null);
    if (page !== "homework") setHomeworkSubmissionToFocus(null);
    window.scrollTo(0, 0);
    if (refreshData || page === "homework" || page === "announcements") {
      setDataLoading(true);
      void loadDashboardData()
        .catch((error) => {
          setToast(
            error instanceof Error
              ? error.message
              : "Firebase-ээс мэдээлэл татаж чадсангүй.",
          );
        })
        .finally(() => setDataLoading(false));
    }
  }

  function applyDashboardData(data: DashboardData) {
    setStudents(data.students);
    setAttendanceRecords(data.attendanceRecords);
    setGradeExams(data.gradeExams);
    setGradeExamNames(data.gradeExamNames);
    setHomeworkAssignments(data.homeworkAssignments);
    setHomeworkSubmissions(data.homeworkSubmissions);
    setAnnouncements(data.announcements);
    setNotifications(data.notifications ?? []);
  }

  async function loadDashboardData() {
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error(await responseError(response));
    applyDashboardData((await response.json()) as DashboardData);
  }

  async function loadAccountProfile() {
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (!response.ok) throw new Error(await responseError(response));
    const body = (await response.json()) as { profile: AccountProfile };
    setAccountProfile(body.profile);
    return body.profile;
  }

  function openNotification(notification: DashboardNotification) {
    setNotificationsOpen(false);
    setShowAllNotifications(false);
    if (!notification.readAt) {
      markNotificationsAsRead([notification.id]);
    }
    setHomeworkSectionToOpen(notification.homeworkSection ?? null);
    if (notification.homeworkSection) {
      setHomeworkSectionRequest((request) => request + 1);
    }
    setHomeworkSubmissionToFocus(notification.submissionId ?? null);
    if (notification.submissionId) {
      setHomeworkSubmissionFocusRequest((request) => request + 1);
    }
    navigate(notification.page, true);
  }

  async function saveMutation(mutation: Record<string, unknown>) {
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    });
    if (!response.ok) throw new Error(await responseError(response));
    applyDashboardData((await response.json()) as DashboardData);
  }

  async function sendPaymentReminder(studentId?: number) {
    if (session?.role !== "teacher") return false;
    try {
      await saveMutation({
        type: "payment.remind",
        ...(studentId === undefined ? {} : { studentId }),
      });
      setToast(
        studentId === undefined
          ? "Төлбөр хүлээгдэж буй болон дутуу төлсөн сурагчдад сануулга илгээлээ."
          : "Төлбөрийн сануулгыг сурагчид илгээлээ.",
      );
      return true;
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Төлбөрийн сануулга илгээж чадсангүй.",
      );
      return false;
    }
  }

  async function login(username: string, pin: string) {
    const loginResponse = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, pin }),
    });
    if (!loginResponse.ok) {
      throw new Error(await responseError(loginResponse));
    }
    const { customToken } = (await loginResponse.json()) as {
      customToken: string;
    };
    const auth = getFirebaseAuth();
    const credential = await signInWithCustomToken(auth, customToken);
    const idToken = await credential.user.getIdToken();
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      await signOut(auth);
      throw new Error(await responseError(response));
    }
    const body = (await response.json()) as { session: LoginSession };

    setDataLoading(true);
    try {
      await Promise.all([loadDashboardData(), loadAccountProfile()]);
      setSession(body.session);
      setBackendError("");
    setActivePage("overview");
    } catch (error) {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(auth);
      throw error;
    } finally {
      setDataLoading(false);
    }
  }

  function closeModal(keepAnnouncementImage = false) {
    if (
      announcementImagePreview?.startsWith("blob:") &&
      !keepAnnouncementImage
    ) {
      URL.revokeObjectURL(announcementImagePreview);
    }
    setAnnouncementImage(null);
    setAnnouncementImagePreview(null);
    setEditingAnnouncementId(null);
    setModal(null);
  }

  function closeProfileEditor() {
    if (profileImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(profileImagePreview);
    }
    setProfileEditorOpen(false);
    setProfileLoading(false);
    setProfileError("");
    setProfileImageFile(null);
    setProfileImagePreview(null);
    setProfileImagePublicId(null);
  }

  async function openProfileEditor() {
    setProfileMenuOpen(false);
    if (modal) closeModal();
    setProfileEditorOpen(true);
    setProfileLoading(true);
    setProfileError("");
    try {
      const profile = await loadAccountProfile();
      setProfileImagePublicId(profile.profileImagePublicId);
      setProfileImagePreview(profile.profileImageUrl);
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Профайл мэдээлэл ачаалж чадсангүй.",
      );
    } finally {
      setProfileLoading(false);
    }
  }

  function chooseProfileImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (profileSaveBusyRef.current) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      event.target.value = "";
      setProfileError("JPG, PNG, WEBP зураг, 10MB хүртэл файл сонгоно уу.");
      return;
    }
    if (profileImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(profileImagePreview);
    }
    const previewUrl = URL.createObjectURL(file);
    setProfileImageFile(file);
    setProfileImagePreview(previewUrl);
    setProfileError("");
    void saveProfileChanges(async () => {
      const uploadedImage = await uploadProfileImage(file);
      URL.revokeObjectURL(previewUrl);
      setProfileImagePreview(uploadedImage.url);
      return { profileImagePublicId: uploadedImage.publicId };
    }, "image");
  }

  function removeProfileImage() {
    if (profileSaveBusyRef.current) return;
    void saveProfileChanges({ profileImagePublicId: null }, "image");
  }

  async function saveProfileChanges(
    changes: AccountProfileChanges,
    target: ProfileSaveTarget,
  ) {
    if (profileSaveBusyRef.current) return false;
    profileSaveBusyRef.current = true;
    setProfileSaving(true);
    setProfileSavingTarget(target);
    setProfileError("");
    try {
      const profileChanges =
        typeof changes === "function" ? await changes() : changes;
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileChanges),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as { profile: AccountProfile };
      if (
        Object.prototype.hasOwnProperty.call(
          profileChanges,
          "profileImagePublicId",
        )
      ) {
        if (profileImagePreview?.startsWith("blob:")) {
          URL.revokeObjectURL(profileImagePreview);
        }
        setProfileImagePublicId(body.profile.profileImagePublicId);
        setProfileImagePreview(body.profile.profileImageUrl);
        setProfileImageFile(null);
      }
      setAccountProfile(body.profile);
      if (session?.role === "student") {
        setStudents((current) =>
          current.map((student) =>
            student.id === session.studentId
              ? {
                  ...student,
                  name: body.profile.name,
                  username: body.profile.username,
                  initials: body.profile.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part.charAt(0))
                    .join("")
                    .toUpperCase(),
                  profileImageUrl: body.profile.profileImageUrl ?? undefined,
                  profileImagePublicId:
                    body.profile.profileImagePublicId ?? undefined,
                }
              : student,
          ),
        );
      }
      setToast("Профайлын өөрчлөлт хадгалагдлаа.");
      return true;
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Профайл мэдээлэл хадгалж чадсангүй.",
      );
      return false;
    } finally {
      profileSaveBusyRef.current = false;
      setProfileSaving(false);
      setProfileSavingTarget(null);
    }
  }

  async function submitProfileName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    return saveProfileChanges(
      { name: String(formData.get("name") ?? "").trim() },
      "name",
    );
  }

  async function submitProfileUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    return saveProfileChanges({
      username: String(formData.get("username") ?? "").trim(),
    }, "username");
  }

  async function submitProfilePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPin = String(formData.get("currentPin") ?? "");
    const newPin = String(formData.get("newPin") ?? "");
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      setProfileError("Өмнөх болон шинэ PIN тус бүр 4 оронтой тоо байна.");
      return false;
    }
    const saved = await saveProfileChanges({ currentPin, newPin }, "pin");
    if (saved) form.reset();
    return saved;
  }

  function openAnnouncement() {
    closeModal();
    setEditingAnnouncementId(null);
    setModal("announcement");
  }

  function openAnnouncementEditor(announcementId: string) {
    const announcement = announcements.find((item) => item.id === announcementId);
    if (!announcement) {
      setToast("Засах мэдээлэл олдсонгүй.");
      return;
    }
    closeModal();
    setEditingAnnouncementId(announcementId);
    setAnnouncementImagePreview(announcement.imageUrl ?? null);
    setModal("edit-announcement");
  }

  function chooseAnnouncementImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      event.target.value = "";
      setToast("JPG, PNG, WEBP зураг, 10MB хүртэл файл сонгоно уу.");
      return;
    }
    if (announcementImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(announcementImagePreview);
    }
    setAnnouncementImage(file);
    setAnnouncementImagePreview(URL.createObjectURL(file));
  }

  async function updateAttendance(
    studentId: number,
    date: string,
    status: AttendanceStatus | undefined,
  ): Promise<boolean> {
    const previousStatus = attendanceRecords[date]?.[studentId];
    if (previousStatus === status) return false;
    const student = students.find((item) => item.id === studentId);
    if (!student) return false;

    const lessonDelta =
      Number(status === "present") - Number(previousStatus === "present");
    const nextLessonCount = student.lessonsInPackage + lessonDelta;
    const paymentDue = student.fee === "Төлсөн" && nextLessonCount >= 12;
    try {
      await saveMutation({
        type: "attendance.set",
        studentId,
        date,
        status: status ?? null,
      });
      setToast(
        paymentDue
          ? `${student.name}-ийн 12 дахь ирцийг бүртгэлээ. Төлбөр нэхэмжлэгдлээ.`
          : "Ирцийн мэдээлэл шинэчлэгдлээ.",
      );
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Ирц хадгалж чадсангүй.");
      return false;
    }
  }

  function toggleTodayAttendance(id: number) {
    const today = getTodayKey();
    const currentStatus = attendanceRecords[today]?.[id];
    return updateAttendance(id, today, currentStatus === "present" ? "absent" : "present");
  }

  async function saveGradeStudent(input: GradeStudentSave): Promise<boolean> {
    try {
      await saveMutation({ type: "grade.student.save", ...input });
      setToast(
        input.status === "published"
          ? "Сурагчийн шалгалтын дүнг нийтэллээ."
          : "Сурагчийн ноорог дүнг хадгаллаа.",
      );
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Дүн хадгалж чадсангүй.");
      return false;
    }
  }

  async function createGradeExamName(name: string): Promise<boolean> {
    try {
      await saveMutation({ type: "grade.name.create", name });
      setToast("Шалгалтын нэрийг бүртгэлээ.");
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Шалгалтын нэр хадгалж чадсангүй.");
      return false;
    }
  }

  async function deleteGradeExam(examId: string): Promise<boolean> {
    try {
      await saveMutation({ type: "grade.delete", examId });
      setToast("Шалгалтын дүнг устгалаа.");
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Шалгалтын дүн устгаж чадсангүй.");
      return false;
    }
  }

  async function submitModal(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    if (modal === "student" || modal === "edit-student") {
      const name = String(formData.get("name") ?? "").trim();
      const phone = String(formData.get("phone") ?? "").trim();
      const username = String(formData.get("username") ?? "").trim();
      const pin = String(formData.get("pin") ?? "");
      const currentStudent = students.find(
        (student) => student.id === editingStudentId,
      );
      if (students.some((student) =>
        student.id !== editingStudentId &&
        student.username.toLowerCase() === username.toLowerCase(),
      )) {
        setStudentFormError("Энэ нэвтрэх нэр бүртгэлтэй байна.");
        return false;
      }

      if ((modal === "student" || !currentStudent?.authUid) && !/^\d{4}$/.test(pin)) {
        setStudentFormError("Нэвтрэх PIN яг 4 оронтой тоо байна.");
        return false;
      }

      if (pin && !/^\d{4}$/.test(pin)) {
        setStudentFormError("Нэвтрэх PIN яг 4 оронтой тоо байна.");
        return false;
      }

      if (modal === "edit-student" && !currentStudent) {
        setStudentFormError("Засах сурагч олдсонгүй. Жагсаалтыг дахин нээнэ үү.");
        return false;
      }

      try {
        if (modal === "edit-student" && currentStudent) {
          await saveMutation({
            type: "student.update",
            studentId: currentStudent.id,
            student: {
              name,
              phone,
              username,
            },
            ...(pin ? { pin } : {}),
            ...(!currentStudent.authUid ? { accountActive: true } : {}),
          });
          setToast(`${name} сурагчийн мэдээллийг шинэчиллээ.`);
        } else {
          await saveMutation({
            type: "student.create",
            student: {
              name,
              phone,
              username,
            },
            pin,
          });
          setToast(`${name} сурагчийн бүртгэл нэмэгдлээ.`);
        }
        setStudentFormError("");
        return true;
      } catch (error) {
        setStudentFormError(
          error instanceof Error ? error.message : "Сурагчийн мэдээлэл хадгалж чадсангүй.",
        );
        return false;
      }
    }

    if (modal === "announcement" || modal === "edit-announcement") {
      const categoryValue = String(formData.get("category") ?? "");
      const category: AnnouncementCategory = announcementCategories.includes(
        categoryValue as AnnouncementCategory,
      )
        ? (categoryValue as AnnouncementCategory)
        : "Мэдээ";
      const linkUrl = String(formData.get("linkUrl") ?? "").trim();
      const editingAnnouncement = announcements.find(
        (announcement) => announcement.id === editingAnnouncementId,
      );
      if (modal === "edit-announcement" && !editingAnnouncement) {
        setToast("Засах мэдээлэл олдсонгүй. Жагсаалтаа дахин нээнэ үү.");
        return false;
      }
      try {
        const uploadedImage = announcementImage
          ? await uploadImage(announcementImage, "announcement")
          : undefined;
        const imageFields = uploadedImage
          ? {
              imageUrl: uploadedImage.url,
              imagePublicId: uploadedImage.publicId,
            }
          : editingAnnouncement?.imageUrl && editingAnnouncement.imagePublicId
            ? {
                imageUrl: editingAnnouncement.imageUrl,
                imagePublicId: editingAnnouncement.imagePublicId,
              }
            : {};
        const announcement = {
          title: String(formData.get("title") ?? "").trim(),
          body: String(formData.get("body") ?? "").trim(),
          category,
          audience: "Бүх сурагч" as const,
          ...(modal === "edit-announcement" || linkUrl
            ? { linkUrl }
            : {}),
          ...imageFields,
        };
        if (modal === "edit-announcement" && editingAnnouncementId) {
          await saveMutation({
            type: "announcement.update",
            announcementId: editingAnnouncementId,
            announcement,
          });
          setToast("Мэдээллийн өөрчлөлт хадгалагдлаа.");
        } else {
          await saveMutation({ type: "announcement.create", announcement });
          setToast("Мэдээлэл нийтлэгдлээ.");
        }
        return true;
      } catch (error) {
        setToast(
          error instanceof Error
            ? error.message
            : modal === "edit-announcement"
              ? "Мэдээлэл засаж чадсангүй."
              : "Мэдээлэл нийтэлж чадсангүй.",
        );
        return false;
      }
    }

    return true;
  }

  const pageTitle =
    navigation.find((item) => item.id === activePage)?.label ?? "Хянах самбар";
  const editingStudent = students.find(
    (student) => student.id === editingStudentId,
  );
  const editingAnnouncement = announcements.find(
    (announcement) => announcement.id === editingAnnouncementId,
  );
  const currentStudent =
    session?.role === "student"
      ? students.find((student) => student.id === session.studentId)
      : undefined;
  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.readAt,
  ).length;
  const hasNotifications = unreadNotificationCount > 0;
  const todayNotificationKey = getTodayKey();
  const orderedNotifications = [...notifications].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const displayedNotifications = showAllNotifications
    ? orderedNotifications
    : orderedNotifications.filter(
        (notification) => getNotificationDateKey(notification.createdAt) === todayNotificationKey,
      );
  const displayedUnreadNotificationCount = displayedNotifications.filter(
    (notification) => !notification.readAt,
  ).length;
  const visibleNavigation = navigation.filter(
    (item) =>
      item.id !== "data" &&
      (session?.role !== "student" || item.id !== "students"),
  );
  const mobileNavigation = visibleNavigation.filter(
    (item) =>
      item.id === "overview" ||
      item.id === "attendance" ||
      item.id === "grades" ||
      item.id === "homework" ||
      item.id === "payments" ||
      item.id === "announcements",
  );

  async function logOut() {
    setProfileMenuOpen(false);
    setNotificationsOpen(false);
    setShowAllNotifications(false);
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      await signOut(getFirebaseAuth());
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Системээс гарч чадсангүй.");
      return;
    }
    setNotificationsOpen(false);
    setNotifications([]);
    setAccountProfile(null);
    setHomeworkSectionToOpen(null);
    setHomeworkSubmissionToFocus(null);
    setSession(null);
    setActivePage("overview");
  }

  if (initializing) {
    return <MathLoader label="Систем ачаалж байна" mode="screen" />;
  }

  if (!session) {
    return (
      <LoginScreen
        setupError={backendError}
        onLogin={login}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="book" size={21} /></span>
          <div>
            <div className="brand-name">Эрдэм</div>
          </div>
        </div>

        <div className="nav-label">Үндсэн цэс</div>
        <nav aria-label="Үндсэн цэс" className="nav-list">
          {visibleNavigation.map((item) => (
            <button
              aria-current={activePage === item.id ? "page" : undefined}
              className={`nav-item ${activePage === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="nav-item sidebar-logout"
          onClick={() => void logOut()}
          type="button"
        >
          <Icon name="logout" size={17} />
          <span>Гарах</span>
        </button>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              aria-label={
                session.role === "teacher"
                  ? "Хянах самбар руу очих"
                  : "Ирц бүртгэл рүү очих"
              }
              className="mobile-brand"
              onClick={() =>
                navigate(session.role === "teacher" ? "overview" : "attendance")
              }
              type="button"
            >
              <span className="brand-mark"><Icon name="book" size={19} /></span>
              <span className="brand-name">Эрдэм</span>
            </button>
            <div className="breadcrumb"><strong>{pageTitle}</strong></div>
          </div>
          <div className="top-actions">
            <button
              aria-label={theme === "light" ? "Шөнийн горим асаах" : "Өдрийн горим асаах"}
              className="icon-button theme-toggle"
              onClick={toggleTheme}
              title={theme === "light" ? "Шөнийн горим" : "Өдрийн горим"}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} size={17} />
            </button>
            <div className="notification-wrap">
              <button
                aria-label={
                  unreadNotificationCount > 0
                    ? `${unreadNotificationCount} уншаагүй мэдэгдэл харах`
                    : "Мэдэгдэл харах"
                }
                aria-expanded={notificationsOpen}
                className="icon-button"
                onClick={() => {
                  const nextOpen = !notificationsOpen;
                  setNotificationsOpen(nextOpen);
                  if (!nextOpen) setShowAllNotifications(false);
                }}
                type="button"
              >
                <Icon name="bell" size={17} />
                {hasNotifications && <span className="notification-dot" />}
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div className="notification-heading">
                    <strong>Мэдэгдэл</strong>
                    <div className="notification-heading-actions">
                      {displayedUnreadNotificationCount > 0 && (
                        <span>{displayedUnreadNotificationCount} шинэ</span>
                      )}
                      <button
                        aria-label={showAllNotifications ? "Өнөөдрийн мэдэгдэл харах" : "Бүх мэдэгдэл харах"}
                        aria-pressed={showAllNotifications}
                        className="notification-all-toggle"
                        onClick={() => setShowAllNotifications((showAll) => !showAll)}
                        type="button"
                      >
                        {showAllNotifications ? "Өнөөдөр" : "Бүгд"}
                      </button>
                    </div>
                  </div>
                  {displayedNotifications.length === 0 ? (
                    <p className="notification-empty">
                      {showAllNotifications ? "Мэдэгдэл алга." : "Өнөөдөр мэдэгдэл алга."}
                    </p>
                  ) : (
                    <div className="notification-list">
                      {displayedNotifications.map((notification) => (
                        <button
                          className={`notification-item ${notification.readAt ? "" : "unread"}`}
                          key={notification.id}
                          onClick={() => openNotification(notification)}
                          type="button"
                        >
                          <span className="notification-message">
                            {!notification.readAt && <i aria-hidden="true" />}
                            {notification.message}
                          </span>
                          <time dateTime={notification.createdAt}>
                            {formatNotificationDate(notification.createdAt)}
                          </time>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div
              className="profile-menu-wrap"
              onKeyDown={(event) => {
                if (!profileMenuOpen || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                );
                if (!items.length) return;
                const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
                const nextIndex = event.key === "ArrowDown"
                  ? (activeIndex + 1) % items.length
                  : (activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
                items[nextIndex]?.focus();
                event.preventDefault();
              }}
              ref={profileMenuRef}
            >
              <button
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label="Профайл цэс"
                className="profile-trigger"
                onClick={() => {
                  setNotificationsOpen(false);
                  setShowAllNotifications(false);
                  setProfileMenuOpen((open) => !open);
                }}
                title="Профайл цэс"
                type="button"
              >
                <ProfileAvatar
                  alt=""
                  className="top-profile-avatar"
                  src={accountProfile?.profileImageUrl}
                />
              </button>
              {profileMenuOpen && (
                <div aria-label="Профайл цэс" className="profile-dropdown" role="menu">
                  <button
                    className="profile-menu-item"
                    onClick={() => void openProfileEditor()}
                    role="menuitem"
                    type="button"
                  >
                    <Icon name="edit" size={16} />
                    <span>Мэдээлэл засах</span>
                  </button>
                  {session.role === "teacher" && (
                    <button
                      className="profile-menu-item"
                      onClick={() => navigate("data")}
                      role="menuitem"
                      type="button"
                    >
                      <Icon name="trash" size={16} />
                      <span>Өгөгдөл</span>
                    </button>
                  )}
                  <div className="profile-menu-divider" />
                  <button
                    className="profile-menu-item profile-menu-logout"
                    onClick={() => void logOut()}
                    role="menuitem"
                    type="button"
                  >
                    <Icon name="logout" size={16} />
                    <span>Гарах</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          {backendError ? (
            <div className="form-error" role="alert">{backendError}</div>
          ) : dataLoading ? (
            <MathLoader label="Сургалтын мэдээлэл ачаалж байна" />
          ) : activePage === "data" ? (
            session.role === "teacher" ? <DataManagementPage /> : null
          ) : activePage === "overview" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {new Intl.DateTimeFormat("mn-MN", {
                      timeZone: "Asia/Ulaanbaatar",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    }).format(currentTime)}
                  </div>
                  <h1>
                    {getGreeting(currentTime)}{" "}
                    <span aria-hidden="true" className="greeting-wave">👋</span>{" "}
                    {session.role === "teacher"
                      ? <>{accountProfile?.name?.trim() && accountProfile.name.trim().toLocaleLowerCase("mn-MN") !== "багш" ? accountProfile.name.trim() : "Багш"} <span className="greeting-teacher-title">багшаа</span></>
                      : currentStudent?.name ?? "Сурагч"}
                  </h1>
                  <p className="page-subtitle">
                    {session.role === "teacher"
                      ? "Сургалтын төвийн өнөөдрийн тойм мэдээлэл."
                      : "Таны сургалтын мэдээллийн тойм."}
                  </p>
                </div>
                {session.role === "teacher" && (
                  <button
                    className="primary-button"
                    onClick={() => navigate("attendance")}
                  >
                    <Icon name="plus" size={16} /> Ирц бүртгэх
                  </button>
                )}
              </div>
              {session.role === "teacher" ? (
                <Overview
                  announcements={announcements}
                  attendanceRecords={attendanceRecords}
                  homeworkSubmissions={homeworkSubmissions}
                  onNavigate={navigate}
                  onToggleAttendance={toggleTodayAttendance}
                  students={students}
                />
              ) : currentStudent ? (
                <StudentOverview student={currentStudent} />
              ) : (
                <div className="empty-state">Сурагчийн бүртгэл олдсонгүй.</div>
              )}
            </>
          ) : (
            <ManagementPage
              announcements={announcements}
              attendanceRecords={attendanceRecords}
              gradeExams={gradeExams}
              gradeExamNames={gradeExamNames}
              homeworkAssignments={homeworkAssignments}
              homeworkSubmissions={homeworkSubmissions}
              onAddAnnouncement={
                session.role === "teacher" ? openAnnouncement : () => {}
              }
              onEditAnnouncement={
                session.role === "teacher" ? openAnnouncementEditor : () => {}
              }
              onDeleteAnnouncement={(id) => {
                if (session.role !== "teacher") return Promise.resolve(false);
                return saveMutation({
                  type: "announcement.delete",
                  announcementId: id,
                })
                  .then(() => {
                    setToast("Мэдээллийг устгалаа.");
                    return true;
                  })
                  .catch((error: unknown) => {
                    setToast(error instanceof Error ? error.message : "Мэдээлэл устгаж чадсангүй.");
                    return false;
                  });
              }}
              onAddStudent={() => {
                if (session.role !== "teacher") return;
                setStudentFormError("");
                setEditingStudentId(null);
                setModal("student");
              }}
              onEditStudent={(id) => {
                if (session.role !== "teacher") return;
                setStudentFormError("");
                setEditingStudentId(id);
                setModal("edit-student");
              }}
              onToast={setToast}
              onSendPaymentReminder={sendPaymentReminder}
              onToggleStudentAccount={(id) => {
                if (session.role !== "teacher") return Promise.resolve(false);
                const student = students.find((item) => item.id === id);
                if (!student) return Promise.resolve(false);
                if (!student.authUid && !student.accountActive) {
                  setToast("Эхлээд сурагчийн мэдээллийг засаж, Firebase имэйл болон түр нууц үг бүртгэнэ үү.");
                  return Promise.resolve(false);
                }
                return saveMutation({
                  type: "student.update",
                  studentId: id,
                  accountActive: !student.accountActive,
                })
                  .then(() => {
                    setToast(
                      student.accountActive
                        ? `${student.name}-ийн нэвтрэх эрхийг хүчингүй болголоо.`
                        : `${student.name}-ийн нэвтрэх эрхийг идэвхжүүллээ.`,
                    );
                    return true;
                  })
                  .catch((error: unknown) => {
                    setToast(error instanceof Error ? error.message : "Эрхийн төлөв шинэчилж чадсангүй.");
                    return false;
                  });
              }}
              onDeleteStudent={(id) => {
                if (session.role !== "teacher") return Promise.resolve(false);
                const student = students.find((item) => item.id === id);
                if (!student) return Promise.resolve(false);
                return saveMutation({ type: "student.delete", studentId: id })
                  .then(() => {
                    setToast(`${student.name} сурагчийг устгалаа.`);
                    return true;
                  })
                  .catch((error: unknown) => {
                    setToast(error instanceof Error ? error.message : "Сурагч устгаж чадсангүй.");
                    return false;
                  });
              }}
              page={activePage}
              role={session.role}
              studentId={currentStudent?.id}
              homeworkSectionToOpen={homeworkSectionToOpen}
              homeworkSectionRequest={homeworkSectionRequest}
              homeworkSubmissionToFocus={homeworkSubmissionToFocus}
              homeworkSubmissionFocusRequest={homeworkSubmissionFocusRequest}
              onSetAttendance={(studentId, date, status) => {
                if (session.role === "teacher") {
                  return updateAttendance(studentId, date, status);
                }
                return Promise.resolve(false);
              }}
              onSaveGradeStudent={(input) => {
                return session.role === "teacher"
                  ? saveGradeStudent(input)
                  : Promise.resolve(false);
              }}
              onCreateGradeExamName={(name) =>
                session.role === "teacher"
                  ? createGradeExamName(name)
                  : Promise.resolve(false)
              }
              onDeleteGradeExam={(examId) =>
                session.role === "teacher"
                  ? deleteGradeExam(examId)
                  : Promise.resolve(false)
              }
              onAddHomeworkAssignment={(assignment: NewHomeworkAssignment) => {
                if (session.role !== "teacher") {
                  return Promise.reject(new Error("Зөвхөн багш даалгавар оруулах эрхтэй."));
                }
                return saveMutation({
                  type: "homework.assignment.create",
                  assignment,
                }).then(() => {
                setToast("Шинэ гэрийн даалгавар нэмэгдлээ.");
                });
              }}
              onToggleHomeworkCounted={(id: string) => {
                if (session.role !== "teacher") return Promise.resolve(false);
                return saveMutation({
                  type: "homework.submission.toggle",
                  submissionId: id,
                })
                  .then(() => {
                    setToast("Даалгаврын тооцооны төлөв шинэчлэгдлээ.");
                    return true;
                  })
                  .catch((error: unknown) => {
                    setToast(error instanceof Error ? error.message : "Төлөв шинэчилж чадсангүй.");
                    return false;
                  });
              }}
              onAddStudentSubmission={(submission) => {
                if (session.role !== "student" || !currentStudent) {
                  return Promise.reject(new Error("Сурагчийн эрх шаардлагатай."));
                }
                return saveMutation({
                  type: "homework.submission.create",
                  assignmentId: submission.assignmentId,
                  fileName: submission.fileName,
                  resourceType: submission.resourceType,
                  url: submission.url,
                  publicId: submission.publicId,
                }).then(() => {
                  setToast("Гэрийн даалгавраа багшид илгээлээ.");
                });
              }}
              onUpdateStudent={(id, patch) => {
                if (session.role !== "teacher") return Promise.resolve(false);
                return saveMutation({
                  type: "student.update",
                  studentId: id,
                  student: patch,
                })
                  .then(() => {
                    setToast("Сурагчийн мэдээлэл шинэчлэгдлээ.");
                    return true;
                  })
                  .catch((error: unknown) => {
                    setToast(error instanceof Error ? error.message : "Сурагчийн мэдээлэл шинэчилж чадсангүй.");
                    return false;
                  });
              }}
              students={
                session.role === "student" && currentStudent
                  ? [currentStudent]
                  : students
              }
            />
          )}
          <footer className="app-footer">
            <span>© 2026 Эрдэм сургалтын платформ</span>
            <span>Хөгжүүлсэн: AndSoft Global Fartner LLC</span>
          </footer>
        </main>
      </div>

      <nav aria-label="Гар утасны үндсэн цэс" className="mobile-tab-bar">
        {mobileNavigation.map((item) => (
          <button
            aria-current={activePage === item.id ? "page" : undefined}
            aria-label={item.label}
            className={`mobile-tab ${activePage === item.id ? "active" : ""}`}
            key={item.id}
            onClick={() => navigate(item.id)}
            title={item.label}
            type="button"
          >
            <span className="mobile-tab-icon">
              <Icon name={item.icon} size={21} />
            </span>
          </button>
        ))}
      </nav>

      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <ProgressForm
            className="modal"
            key={`${modal}-${editingStudentId ?? ""}-${editingAnnouncementId ?? ""}`}
            onComplete={() => {
              setEditingStudentId(null);
              closeModal();
            }}
            onSubmit={submitModal}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {modal === "student"
                    ? "Сурагч нэмэх"
                    : modal === "edit-student"
                      ? "Сурагчийн мэдээлэл засах"
                      : modal === "edit-announcement"
                        ? "Мэдээлэл засах"
                        : "Шинэ мэдээлэл"}
                </h2>
                <p>
                  {modal === "announcement" || modal === "edit-announcement"
                    ? "Сурагч болон эцэг эхэд харагдах мэдээллийг оруулна уу."
                    : modal === "edit-student"
                      ? "Сурагчийн бүртгэлтэй мэдээллийг шинэчилнэ үү."
                      : "Сурагчийн үндсэн мэдээллийг бөглөнө үү."}
                </p>
              </div>
              <button
                aria-label="Хаах"
                className="icon-button"
                onClick={() => closeModal()}
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            {modal === "student" || modal === "edit-student" ? (
              <>
                <div className="form-field">
                  <label htmlFor="student-name">Овог, нэр</label>
                  <input
                    autoFocus
                    className="form-input"
                    id="student-name"
                    name="name"
                    placeholder="Жишээ: Энхжин Бат"
                    defaultValue={editingStudent?.name}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="student-phone">Утасны дугаар</label>
                  <input
                    className="form-input"
                    id="student-phone"
                    inputMode="tel"
                    name="phone"
                    placeholder="9911 2233"
                    defaultValue={editingStudent?.phone}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="student-username">Нэвтрэх нэр</label>
                  <input
                    autoComplete="username"
                    className="form-input"
                    id="student-username"
                    maxLength={28}
                    minLength={1}
                    name="username"
                    placeholder="28 хүртэлх тэмдэгт"
                    defaultValue={editingStudent?.username}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="student-pin">
                    {editingStudent?.authUid ? "Шинэ PIN (заавал биш)" : "4 оронтой PIN"}
                  </label>
                  <input
                    className="form-input"
                    id="student-pin"
                    inputMode="numeric"
                    maxLength={4}
                    minLength={4}
                    name="pin"
                    placeholder={editingStudent?.authUid ? "Хоосон бол өөрчлөхгүй" : "4 оронтой тоо"}
                    required={modal === "student" || !editingStudent?.authUid}
                    type="password"
                  />
                  <span className="field-hint">
                    PIN-ийг хамгаалж hash хэлбэрээр хадгална.
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="form-field">
                  <label htmlFor="announcement-title">Гарчиг</label>
                  <input
                    autoFocus
                    className="form-input"
                    defaultValue={editingAnnouncement?.title}
                    id="announcement-title"
                    name="title"
                    placeholder="Мэдээллийн гарчиг"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="announcement-body">Агуулга</label>
                  <textarea
                    className="form-textarea"
                    id="announcement-body"
                    name="body"
                    placeholder="Мэдээллээ бичнэ үү..."
                    defaultValue={editingAnnouncement?.body}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="announcement-category">Нийтлэлийн төрөл</label>
                  <StyledSelect
                    ariaLabel="Нийтлэлийн төрөл"
                    className="form-input"
                    defaultValue={editingAnnouncement?.category ?? "Мэдээ"}
                    id="announcement-category"
                    name="category"
                    options={announcementCategories.map((category) => ({
                      value: category,
                      label: category,
                    }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="announcement-link">Линк хавсаргах</label>
                  <input
                    className="form-input"
                    defaultValue={editingAnnouncement?.linkUrl ?? ""}
                    id="announcement-link"
                    name="linkUrl"
                    placeholder="https://..."
                    type="url"
                  />
                  <span className="field-hint">
                    YouTube, Facebook, Instagram, Google Drive болон бусад HTTPS линк.
                  </span>
                </div>
                <div className="form-field">
                  <label htmlFor="announcement-image">
                    {modal === "edit-announcement" ? "Зураг солих" : "Зураг хавсаргах"}
                  </label>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="form-input"
                    id="announcement-image"
                    onChange={chooseAnnouncementImage}
                    type="file"
                  />
                  <span className="field-hint">
                    {modal === "edit-announcement" && editingAnnouncement?.imageUrl
                      ? "Шинэ зураг сонгоогүй бол одоогийн зураг хадгалагдана."
                      : "JPG, PNG, WEBP · 10MB хүртэл"}
                  </span>
                  {announcementImage && (
                    <span className="field-hint">{announcementImage.name}</span>
                  )}
                  {announcementImagePreview && (
                    <Image
                      alt="Нийтлэлийн зургийн урьдчилсан харагдац"
                      className="announcement-image-preview"
                      height={480}
                      unoptimized
                      src={announcementImagePreview}
                      width={720}
                    />
                  )}
                </div>
              </>
            )}
            {(modal === "student" || modal === "edit-student") && studentFormError && (
              <p className="form-error" role="alert">{studentFormError}</p>
            )}
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => closeModal()}
                type="button"
              >
                Болих
              </button>
              <ProgressButton
                className="primary-button"
                loadingLabel={
                  modal === "announcement"
                    ? "Нийтэлж байна"
                    : modal === "edit-student" || modal === "edit-announcement"
                      ? "Хадгалж байна"
                      : "Бүртгэж байна"
                }
                type="submit"
              >
                {modal === "announcement"
                  ? "Нийтлэх"
                  : modal === "edit-announcement"
                    ? "Өөрчлөлт хадгалах"
                    : modal === "edit-student"
                      ? "Өөрчлөлт хадгалах"
                      : "Бүртгэх"}
              </ProgressButton>
            </div>
          </ProgressForm>
        </div>
      )}
      {profileEditorOpen && (
        <div
          className="modal-backdrop profile-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeProfileEditor();
          }}
        >
          <div
            aria-labelledby="profile-modal-heading"
            aria-modal="true"
            className="modal profile-edit-modal"
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <h2 id="profile-modal-heading">Профайл мэдээлэл засах</h2>
                <p>Мэдээлэл тус бүрийг өөрчлөөд дангаар нь хадгална.</p>
              </div>
              <button
                aria-label="Хаах"
                className="icon-button"
                onClick={closeProfileEditor}
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            {profileLoading ? (
              <MathLoader label="Профайл мэдээлэл ачаалж байна" />
            ) : accountProfile ? (
              <div className="profile-edit-sections">
                {profileError && <p className="form-error" role="alert">{profileError}</p>}
                <div
                  aria-busy={profileSavingTarget === "image" || undefined}
                  className="profile-setting-form profile-photo-form"
                >
                  <div className="profile-photo-row">
                    <ProfileAvatar
                      alt=""
                      className="profile-edit-avatar"
                      src={profileImagePreview}
                    />
                    <div className="profile-photo-controls">
                      <label className="secondary-button" htmlFor="profile-image">
                        Зураг сонгох
                      </label>
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        className="profile-image-input"
                        disabled={profileSaving}
                        id="profile-image"
                        onChange={chooseProfileImage}
                        type="file"
                      />
                      {(profileImagePreview || profileImagePublicId) && (
                        <button
                          className="profile-image-remove"
                          disabled={profileSaving}
                          onClick={() => {
                            removeProfileImage();
                          }}
                          type="button"
                        >
                          Зураг арилгах
                        </button>
                      )}
                      <span className="field-hint">JPG, PNG, WEBP · 10MB хүртэл</span>
                      {profileImageFile && (
                        <span className="field-hint">{profileImageFile.name}</span>
                      )}
                      {profileSavingTarget === "image" && (
                        <span aria-live="polite" className="profile-image-saving" role="status">
                          Зураг хадгалж байна...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <ProgressForm
                  aria-busy={profileSaving || undefined}
                  className="profile-setting-form"
                  onSubmit={submitProfileName}
                >
                  <div className="form-field">
                    <label htmlFor="profile-name">Нэр</label>
                    <div className="profile-input-wrap">
                      <input
                        autoFocus
                        className="form-input"
                        defaultValue={accountProfile.name}
                        disabled={profileSaving}
                        id="profile-name"
                        maxLength={100}
                        minLength={2}
                        name="name"
                        required
                      />
                      <ProgressButton
                        className="primary-button profile-input-save"
                        disabled={profileSaving}
                        loadingLabel="Хадгалж байна"
                        type="submit"
                      >
                        Хадгалах
                      </ProgressButton>
                    </div>
                  </div>
                </ProgressForm>

                <ProgressForm
                  aria-busy={profileSaving || undefined}
                  className="profile-setting-form"
                  onSubmit={submitProfileUsername}
                >
                  <div className="form-field">
                    <label htmlFor="profile-username">Нэвтрэх нэр</label>
                    <div className="profile-input-wrap">
                      <input
                        autoComplete="username"
                        className="form-input"
                        defaultValue={accountProfile.username}
                        disabled={profileSaving}
                        id="profile-username"
                        maxLength={28}
                        minLength={1}
                        name="username"
                        required
                      />
                      <ProgressButton
                        className="primary-button profile-input-save"
                        disabled={profileSaving}
                        loadingLabel="Хадгалж байна"
                        type="submit"
                      >
                        Хадгалах
                      </ProgressButton>
                    </div>
                  </div>
                </ProgressForm>

                <ProgressForm
                  aria-busy={profileSaving || undefined}
                  className="profile-setting-form profile-pin-section"
                  onSubmit={submitProfilePin}
                >
                  <strong>PIN солих</strong>
                  <span className="field-hint">Өөрчлөхдөө өмнөх PIN-ээ оруулна.</span>
                  <div className="form-field">
                    <label htmlFor="profile-current-pin">Өмнөх PIN</label>
                    <input
                      autoComplete="current-password"
                      className="form-input"
                      disabled={profileSaving}
                      id="profile-current-pin"
                      inputMode="numeric"
                      maxLength={4}
                      minLength={4}
                      name="currentPin"
                      pattern="[0-9]{4}"
                      required
                      type="password"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="profile-new-pin">Шинэ PIN</label>
                    <div className="profile-input-wrap">
                      <input
                        autoComplete="new-password"
                        className="form-input"
                        disabled={profileSaving}
                        id="profile-new-pin"
                        inputMode="numeric"
                        maxLength={4}
                        minLength={4}
                        name="newPin"
                        pattern="[0-9]{4}"
                        required
                        type="password"
                      />
                      <ProgressButton
                        className="primary-button profile-input-save profile-pin-save"
                        disabled={profileSaving}
                        loadingLabel="Сольж байна"
                        type="submit"
                      >
                        PIN солих
                      </ProgressButton>
                    </div>
                  </div>
                </ProgressForm>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {toast && <div role="status" className="toast">{toast}</div>}
    </div>
  );
}

function LoginScreen({
  setupError,
  onLogin,
}: {
  setupError: string;
  onLogin: (username: string, pin: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !/^\d{4}$/.test(pin)) {
      setError("Нэвтрэх нэр болон 4 оронтой PIN-ээ оруулна уу.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onLogin(cleanUsername, pin);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Нэвтэрч чадсангүй. Дахин оролдоно уу.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section aria-labelledby="login-title" className="login-card">
        <div className="login-panel">
          <div className="login-brand">
            <span className="brand-mark"><Icon name="book" size={22} /></span>
            <span className="brand-name">Эрдэм</span>
          </div>
          <div className="login-heading">
            <h1 id="login-title">Тавтай морил</h1>
            <p>Нэвтрэх нэр болон 4 оронтой PIN-ээ оруулна уу.</p>
          </div>
          {setupError && <p className="form-error" role="alert">{setupError}</p>}
          <form className="login-form" onSubmit={submitLogin}>
            <label className="form-field">
              <span>Нэвтрэх нэр</span>
              <input
                autoComplete="username"
                className="form-input"
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError("");
                }}
                maxLength={28}
                placeholder="Нэвтрэх нэрээ оруулна уу"
                type="text"
                value={username}
              />
            </label>
            <label className="form-field">
              <span>4 оронтой PIN</span>
              <div className="login-password-wrap">
                <input
                  autoComplete="current-password"
                  className="form-input"
                  onChange={(event) => {
                    setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                    setError("");
                  }}
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  placeholder="••••"
                  type={pinVisible ? "text" : "password"}
                  value={pin}
                />
                <button
                  aria-label={pinVisible ? "PIN кодыг нуух" : "PIN кодыг харах"}
                  aria-pressed={pinVisible}
                  className="login-password-toggle"
                  onClick={() => setPinVisible((visible) => !visible)}
                  type="button"
                >
                  <Icon name="eye" size={17} />
                </button>
              </div>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" disabled={submitting} type="submit">
              <span>{submitting ? "Нэвтэрч байна..." : "Нэвтрэх"}</span>
              <span className="login-submit-icon"><Icon name="arrow" size={16} /></span>
            </button>
          </form>
          <p className="login-role-hint">
            <span aria-hidden="true" className="login-role-dot" />
            Таны эрх нэвтрэх нэрээр автоматаар танигдана.
          </p>
        </div>
        <aside aria-label="Ном барьсан сурагчдын зураг" className="login-art-panel">
          <span className="login-art-tag">
            <span aria-hidden="true" className="login-art-tag-dot" />
            СУРАЛЦАХАД ТАНЬ ТУСАЛЪЯ
          </span>
          <Image
            alt="Ном барьсан хүү, утас барьсан охин"
            className="login-illustration"
            height={1536}
            priority
            src="/login-students-3d.png"
            width={1300}
          />
        </aside>
      </section>
    </main>
  );
}
