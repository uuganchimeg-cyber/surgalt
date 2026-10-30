"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  TransitionEvent as ReactTransitionEvent,
} from "react";
import Image from "next/image";
import type { Student, PageId, UserRole } from "./school-data";
import { formatAttendanceDate, getDateKey } from "./attendance-data";
import type {
  AttendanceRecords,
  AttendanceStatus,
} from "./attendance-data";
import {
  formatExamDate,
  getStudentGradeStatus,
  normalizeGradeExamName,
} from "./grade-data";
import type { GradeExam, GradeStudentSave } from "./grade-data";
import type {
  HomeworkAssignment,
  HomeworkSection,
  HomeworkSubmission,
  NewHomeworkAssignment,
} from "./homework-data";
import { formatHomeworkDate } from "./homework-data";
import { Icon } from "./icons";
import {
  ProgressButton,
  ProgressForm,
} from "./action-progress";
import { uploadHomeworkFile } from "@/lib/cloudinary-client";
import { ProfileAvatar } from "./profile-avatar";
import { StyledSelect } from "./styled-select";

export const announcementCategories = [
  "Мэдээ",
  "Зар",
  "Үйл ажиллагаа",
  "Анхааруулга",
  "Сануулга",
  "Мэдэгдэл",
] as const;

export type AnnouncementCategory = (typeof announcementCategories)[number];

export type Announcement = {
  id: string;
  title: string;
  body: string;
  date: string;
  category: AnnouncementCategory;
  audience: "Бүх сурагч";
  imageUrl?: string;
  imagePublicId?: string;
  linkUrl?: string;
};

const paymentStatusOptions = [
  { label: "Төлсөн", value: "Төлсөн", tone: "paid" },
  { label: "Төлөөгүй", value: "Хүлээгдэж буй", tone: "pending" },
  { label: "Дутуу", value: "Дутуу төлсөн", tone: "partial" },
] as const;

export function ManagementPage({
  page,
  role,
  studentId,
  students,
  onUpdateStudent,
  homeworkAssignments,
  homeworkSubmissions,
  onAddHomeworkAssignment,
  onAddStudentSubmission,
  onToggleHomeworkCounted,
  announcements,
  onDeleteAnnouncement,
  onEditAnnouncement,
  onToast,
  onAddStudent,
  onAddAnnouncement,
  onToggleStudentAccount,
  onEditStudent,
  onDeleteStudent,
  attendanceRecords,
  onSetAttendance,
  gradeExams,
  gradeExamNames,
  onSaveGradeStudent,
  onCreateGradeExamName,
  onDeleteGradeExam,
  onSendPaymentReminder,
  homeworkSectionToOpen,
  homeworkSectionRequest,
  homeworkSubmissionToFocus,
  homeworkSubmissionFocusRequest,
}: {
  page: Exclude<PageId, "overview">;
  role: UserRole;
  studentId?: number;
  students: Student[];
  onUpdateStudent: (id: number, patch: Partial<Student>) => Promise<unknown>;
  homeworkAssignments: HomeworkAssignment[];
  homeworkSubmissions: HomeworkSubmission[];
  onAddHomeworkAssignment: (assignment: NewHomeworkAssignment) => Promise<void>;
  onAddStudentSubmission: (
    submission: Omit<HomeworkSubmission, "id" | "submittedAt" | "counted">,
  ) => Promise<void>;
  onToggleHomeworkCounted: (id: string) => Promise<unknown>;
  announcements: Announcement[];
  onDeleteAnnouncement: (id: string) => Promise<unknown>;
  onEditAnnouncement: (id: string) => void;
  onToast: (message: string) => void;
  onAddStudent: () => void;
  onAddAnnouncement: () => void;
  onToggleStudentAccount: (id: number) => Promise<unknown>;
  onEditStudent: (id: number) => void;
  onDeleteStudent: (id: number) => Promise<unknown>;
  attendanceRecords: AttendanceRecords;
  onSetAttendance: (
    studentId: number,
    date: string,
    status: AttendanceStatus | undefined,
  ) => Promise<unknown>;
  gradeExams: GradeExam[];
  gradeExamNames: string[];
  onSaveGradeStudent: (input: GradeStudentSave) => Promise<unknown>;
  onCreateGradeExamName: (name: string) => Promise<unknown>;
  onDeleteGradeExam: (examId: string) => Promise<unknown>;
  onSendPaymentReminder: (studentId?: number) => Promise<boolean>;
  homeworkSectionToOpen?: HomeworkSection | null;
  homeworkSectionRequest?: number;
  homeworkSubmissionToFocus?: string | null;
  homeworkSubmissionFocusRequest?: number;
}) {
  const [query, setQuery] = useState("");
  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        student.name
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, students],
  );
  const currentStudent = students.find((student) => student.id === studentId);
  function updateStudent(id: number, patch: Partial<Student>) {
    return onUpdateStudent(id, patch);
  }

  return (
    <>
      {page === "attendance" && (
        <AttendanceView
          attendanceRecords={attendanceRecords}
          onQueryChange={setQuery}
          query={query}
          role={role}
          students={filteredStudents}
          onSetAttendance={onSetAttendance}
        />
      )}
      {page === "students" && (
        <StudentsView
          onAddStudent={onAddStudent}
          onQueryChange={setQuery}
          query={query}
          students={filteredStudents}
          onEditStudent={onEditStudent}
          onDeleteStudent={onDeleteStudent}
          onToggleStudentAccount={onToggleStudentAccount}
        />
      )}
      {page === "grades" && (
        <GradesView
          exams={gradeExams}
          examNames={gradeExamNames}
          allStudents={students}
          query={query}
          onQueryChange={setQuery}
          role={role}
          studentId={studentId}
          students={filteredStudents}
          onSaveStudent={onSaveGradeStudent}
          onCreateExamName={onCreateGradeExamName}
          onDeleteExam={onDeleteGradeExam}
          onToast={onToast}
        />
      )}
      {page === "homework" && (
        <HomeworkView
          assignments={homeworkAssignments}
          submissions={homeworkSubmissions}
          onAddAssignment={onAddHomeworkAssignment}
          onAddStudentSubmission={onAddStudentSubmission}
          onToggleCounted={onToggleHomeworkCounted}
          onToast={onToast}
          role={role}
          student={currentStudent}
          sectionToOpen={homeworkSectionToOpen}
          sectionRequest={homeworkSectionRequest}
          submissionToFocus={homeworkSubmissionToFocus}
          submissionFocusRequest={homeworkSubmissionFocusRequest}
        />
      )}
      {page === "payments" && (
        <PaymentsView
          query={query}
          students={filteredStudents}
          onQueryChange={setQuery}
          role={role}
          updateStudent={updateStudent}
          onSendPaymentReminder={onSendPaymentReminder}
          onToast={onToast}
        />
      )}
      {page === "announcements" && (
        <AnnouncementView
          announcements={announcements}
          onAddAnnouncement={onAddAnnouncement}
          onDeleteAnnouncement={onDeleteAnnouncement}
          onEditAnnouncement={onEditAnnouncement}
          role={role}
        />
      )}
    </>
  );
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return getDateKey(new Date(Date.UTC(year, month - 1, day + days, 12)));
}

function safeHttpsUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function AttendanceView({
  students,
  attendanceRecords,
  query,
  onQueryChange,
  onSetAttendance,
  role,
}: {
  students: Student[];
  attendanceRecords: AttendanceRecords;
  query: string;
  onQueryChange: (value: string) => void;
  role: UserRole;
  onSetAttendance: (
    studentId: number,
    date: string,
    status: AttendanceStatus | undefined,
  ) => Promise<unknown>;
}) {
  const [selectedDate, setSelectedDate] = useState(() =>
    getDateKey(new Date()),
  );
  const calendarViewportRef = useRef<HTMLDivElement | null>(null);
  const calendarDragRef = useRef<{
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);
  const pendingCalendarShiftRef = useRef(0);
  const suppressCalendarClickRef = useRef(false);
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [calendarAnimating, setCalendarAnimating] = useState(false);
  const selectedRecords = attendanceRecords[selectedDate] ?? {};
  const statuses = students.flatMap((student) => {
    const status = selectedRecords[student.id];
    return status ? [status] : [];
  });
  const present = statuses.filter((status) => status === "present").length;
  const absent = statuses.filter((status) => status === "absent").length;
  const excused = statuses.filter((status) => status === "excused").length;
  const unrecorded = Math.max(0, students.length - statuses.length);

  function beginCalendarSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (calendarAnimating) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    calendarDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
  }

  function moveCalendarSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = calendarDragRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (!drag.dragging) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        calendarDragRef.current = null;
        return;
      }
      drag.dragging = true;
      suppressCalendarClickRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may not be available in older browsers.
      }
    }

    setCalendarOffset(deltaX);
  }

  function finishCalendarSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = calendarDragRef.current;
    calendarDragRef.current = null;
    if (!drag?.dragging) return;

    const deltaX = event.clientX - drag.x;
    const width = calendarViewportRef.current?.clientWidth ?? 0;
    const threshold = Math.min(80, Math.max(48, width * 0.15));
    pendingCalendarShiftRef.current =
      Math.abs(deltaX) >= threshold ? (deltaX < 0 ? 7 : -7) : 0;
    setCalendarAnimating(true);
    setCalendarOffset(
      pendingCalendarShiftRef.current === 0
        ? 0
        : deltaX < 0
          ? -width
          : width,
    );
  }

  function finishCalendarAnimation(event: ReactTransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") {
      return;
    }
    const weekShift = pendingCalendarShiftRef.current;
    pendingCalendarShiftRef.current = 0;
    if (weekShift) {
      setSelectedDate((current) => shiftDateKey(current, weekShift));
    }
    setCalendarOffset(0);
    setCalendarAnimating(false);
    suppressCalendarClickRef.current = false;
  }

  function cancelCalendarSwipe() {
    const drag = calendarDragRef.current;
    calendarDragRef.current = null;
    if (!drag?.dragging) return;
    pendingCalendarShiftRef.current = 0;
    setCalendarAnimating(true);
    setCalendarOffset(0);
  }

  function renderCalendarWeek(weekOffset: number) {
    const pageSelectedDate = shiftDateKey(selectedDate, weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) =>
      shiftDateKey(pageSelectedDate, index - 6),
    ).map((day) => {
      const dayStatuses = students.flatMap((student) => {
        const status = attendanceRecords[day]?.[student.id];
        return status ? [status] : [];
      });
      const dayPresent = dayStatuses.filter((status) => status === "present").length;
      const dayLabel = new Intl.DateTimeFormat("mn-MN", {
        weekday: "short",
      }).format(new Date(`${day}T12:00:00`));
      const isSelected = pageSelectedDate === day;

      return (
        <button
          aria-pressed={weekOffset === 0 && selectedDate === day}
          className={`attendance-day ${isSelected ? "selected" : ""}`}
          key={day}
          onClick={(event) => {
            if (suppressCalendarClickRef.current) {
              event.preventDefault();
              return;
            }
            setSelectedDate(day);
          }}
        >
          <span>{dayLabel}</span>
          <strong>{Number(day.slice(-2))}</strong>
          <small>
            {dayStatuses.length ? `${dayPresent} ирсэн` : "Бүртгэлгүй"}
          </small>
        </button>
      );
    });
  }

  return (
    <div className="attendance-page">
      <section className="panel attendance-overview">
        <div className="attendance-date-header">
          <div className="attendance-date-heading">
            <div className="attendance-date-title-row">
              {role === "teacher" && (
                <input
                  aria-label="Сурагч хайх"
                  className="search-input"
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Сурагч хайх..."
                  value={query}
                />
              )}
              <h2 className="attendance-date-title">
                {formatAttendanceDate(selectedDate)}
              </h2>
            </div>
          </div>
          <div className="attendance-date-actions">
            <label className="date-picker-label">
              <Icon name="calendar" size={15} />
              <input
                aria-label="Ирцийн огноо сонгох"
                className="date-picker"
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </label>
            <button
              className="secondary-button"
              onClick={() => setSelectedDate(getDateKey(new Date()))}
            >
              Өнөөдөр
            </button>
          </div>
        </div>
        <div
          aria-label="Ирцийн календарь. Зүүн эсвэл баруун тийш чирж долоо хоног солино."
          className="attendance-week-viewport"
          ref={calendarViewportRef}
          role="group"
        >
          <div
            className="attendance-week"
            onPointerCancel={cancelCalendarSwipe}
            onPointerDown={beginCalendarSwipe}
            onPointerMove={moveCalendarSwipe}
            onPointerUp={finishCalendarSwipe}
            onTransitionEnd={finishCalendarAnimation}
            style={{
              transform: `translateX(calc(-33.333333% + ${calendarOffset}px))`,
              transition: calendarAnimating
                ? "transform 280ms cubic-bezier(0.22, 0.75, 0.25, 1)"
                : "none",
            }}
          >
            {[-1, 0, 1].map((weekOffset) => (
              <div className="attendance-week-page" key={weekOffset}>
                {renderCalendarWeek(weekOffset)}
              </div>
            ))}
          </div>
        </div>
        <div className="attendance-counts">
          <AttendanceCount label="Ирсэн" value={present} tone="present" />
          <AttendanceCount label="Тасалсан" value={absent} tone="absent" />
          <AttendanceCount label="Чөлөөтэй" value={excused} tone="excused" />
          <AttendanceCount label="Бүртгээгүй" value={unrecorded} tone="unrecorded" />
        </div>
      </section>

      <section className="panel attendance-list-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              {role === "student" ? "Миний ирц" : "Сурагчдын ирц"}
            </h2>
            <p className="panel-subtitle">
              {students.length} сурагч · {present} ирсэн · {absent} тасалсан · {excused} чөлөөтэй
            </p>
          </div>
        </div>
        <div className="attendance-student-list">
          {students.map((student) => {
            const status = selectedRecords[student.id];
            return (
              <div className="attendance-student-row" key={student.id}>
                <StudentIdentity student={student} />
                {role === "student" ? (
                  <span className={`pill ${status ? "green" : "gray"}`}>
                    {status === "present"
                      ? "Ирсэн"
                      : status === "absent"
                        ? "Тасалсан"
                        : status === "excused"
                          ? "Чөлөөтэй"
                          : "Бүртгээгүй"}
                  </span>
                ) : (
                  <div className="attendance-status-control" role="group" aria-label={`${student.name} ирц`}>
                      <AttendanceStatusButton
                        active={status === "present"}
                        label="Ирсэн"
                        studentName={student.name}
                        onClick={() => onSetAttendance(student.id, selectedDate, "present")}
                        tone="present"
                      />
                      <AttendanceStatusButton
                        active={status === "absent"}
                        label="Тасалсан"
                        studentName={student.name}
                        onClick={() => onSetAttendance(student.id, selectedDate, "absent")}
                        tone="absent"
                      />
                      <AttendanceStatusButton
                        active={status === "excused"}
                        label="Чөлөөтэй"
                        studentName={student.name}
                        onClick={() => onSetAttendance(student.id, selectedDate, "excused")}
                        tone="excused"
                      />
                      {status && (
                        <ProgressButton
                          aria-label={`${student.name} ирцийг арилгах`}
                          className="attendance-clear"
                          loadingLabel="Арилгаж байна"
                          onClick={() => onSetAttendance(student.id, selectedDate, undefined)}
                        >
                          Арилгах
                        </ProgressButton>
                      )}
                  </div>
                )}
              </div>
            );
          })}
          {students.length === 0 && (
            <div className="empty-state">Сурагч олдсонгүй.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function AttendanceCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: AttendanceStatus | "unrecorded";
}) {
  return (
    <div className="attendance-count">
      <span className={`attendance-count-dot ${tone}`} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AttendanceStatusButton({
  active,
  label,
  studentName,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  studentName: string;
  onClick: () => unknown | Promise<unknown>;
  tone: AttendanceStatus;
}) {
  return (
    <ProgressButton
      aria-label={`${studentName} · ${label}`}
      aria-pressed={active}
      className={`attendance-status-button ${tone} ${active ? "selected" : ""}`}
      loadingLabel="Бүртгэж байна"
      onClick={onClick}
    >
      {label}
    </ProgressButton>
  );
}

function StudentsView({
  students,
  query,
  onQueryChange,
  onAddStudent,
  onToggleStudentAccount,
  onEditStudent,
  onDeleteStudent,
}: {
  students: Student[];
  query: string;
  onQueryChange: (value: string) => void;
  onAddStudent: () => void;
  onToggleStudentAccount: (id: number) => Promise<unknown>;
  onEditStudent: (id: number) => void;
  onDeleteStudent: (id: number) => Promise<unknown>;
}) {
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const activeCount = students.filter((student) => student.accountActive).length;

  return (
    <>
      <section className="panel">
        <div className="panel-header students-header">
          <div>
            <h2 className="panel-title">Бүртгэлтэй сурагчид</h2>
            <p className="panel-subtitle">
              {students.length} сурагч · {activeCount} эрх идэвхтэй · {students.length - activeCount} эрх хүчингүй
            </p>
          </div>
          <div className="students-header-actions">
            <input
              aria-label="Сурагч хайх"
              className="search-input"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Сурагч хайх..."
              value={query}
            />
            <button className="primary-button" onClick={onAddStudent}>
              <Icon name="plus" size={15} /> Сурагч нэмэх
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table students-table">
            <thead>
              <tr>
                <th>Сурагч</th>
                <th>Утас</th>
                <th>Нэвтрэх нэр</th>
                <th>Эрхийн төлөв</th>
                <th>Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td><StudentIdentity student={student} /></td>
                  <td>{student.phone}</td>
                  <td><span className="username-value">{student.username}</span></td>
                  <td>
                    <ProgressButton
                      aria-label={`${student.name} эрхийг ${student.accountActive ? "идэвхгүй болгох" : "идэвхтэй болгох"}`}
                      aria-pressed={student.accountActive}
                      className={`account-status ${student.accountActive ? "active" : "inactive"}`}
                      loadingLabel="Шинэчилж байна"
                      onClick={() => onToggleStudentAccount(student.id)}
                    >
                      <span className="account-status-dot" />
                      {student.accountActive ? "Идэвхтэй" : "Идэвхгүй"}
                    </ProgressButton>
                  </td>
                  <td>
                    <div className="student-actions">
                      <button
                        aria-label={`${student.name} мэдээлэл засах`}
                        className="edit-student-button"
                        onClick={() => onEditStudent(student.id)}
                      >
                        <Icon name="edit" size={14} />
                        <span>Засах</span>
                      </button>
                      <button
                        aria-label={`${student.name} сурагчийг устгах`}
                        className="delete-student-button"
                        onClick={() => setStudentToDelete(student)}
                        title="Сурагч устгах"
                      >
                        <Icon name="trash" size={14} />
                        <span>Устгах</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && <div className="empty-state">Сурагч олдсонгүй.</div>}
        </div>
      </section>
      {studentToDelete && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStudentToDelete(null);
          }}
        >
          <div aria-labelledby="delete-student-title" aria-modal="true" className="modal" role="dialog">
            <div className="modal-header">
              <div>
                <h2 id="delete-student-title">Сурагчийг устгах уу?</h2>
                <p>
                  {studentToDelete.name}-ийн бүртгэл жагсаалтаас устна. Энэ үйлдлийг буцаах боломжгүй.
                </p>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setStudentToDelete(null)}
              >
                Болих
              </button>
              <ProgressButton
                className="danger-button"
                loadingLabel="Устгаж байна"
                onClick={() => onDeleteStudent(studentToDelete.id)}
                onComplete={() => setStudentToDelete(null)}
              >
                Устгах
              </ProgressButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GradesView({
  students,
  exams,
  examNames,
  allStudents,
  query,
  onQueryChange,
  onSaveStudent,
  onCreateExamName,
  onDeleteExam,
  onToast,
  role,
  studentId,
}: {
  students: Student[];
  exams: GradeExam[];
  examNames: string[];
  allStudents: Student[];
  query: string;
  onQueryChange: (value: string) => void;
  onSaveStudent: (input: GradeStudentSave) => Promise<unknown>;
  onCreateExamName: (name: string) => Promise<unknown>;
  onDeleteExam: (examId: string) => Promise<unknown>;
  onToast: (message: string) => void;
  role: UserRole;
  studentId?: number;
}) {
  const [title, setTitle] = useState("");
  const [newExamName, setNewExamName] = useState("");
  const [examDate, setExamDate] = useState(getDateKey(new Date()));
  const [grades, setGrades] = useState<Record<number, number | null>>({});
  const [editingExamId, setEditingExamId] = useState<string | undefined>();
  const [examHistoryExpanded, setExamHistoryExpanded] = useState(false);
  const [historyDate, setHistoryDate] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [savingStudentId, setSavingStudentId] = useState<number | null>(null);
  const [viewingExam, setViewingExam] = useState<GradeExam | null>(null);
  const activeExamIdRef = useRef<string | undefined>(undefined);
  const examHistorySectionRef = useRef<HTMLElement | null>(null);
  const activeExam = exams.find((exam) => exam.id === editingExamId);
  const visibleExams = exams
    .filter(
      (exam) =>
        (!historyDate || exam.date === historyDate) &&
        exam.title.toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase()),
    )
    .sort((left, right) => right.date.localeCompare(left.date));
  const studentExams = exams.filter(
    (exam) =>
      role === "student" &&
      studentId !== undefined &&
      getStudentGradeStatus(exam, studentId) === "published" &&
      exam.grades[studentId] !== null &&
      exam.grades[studentId] !== undefined,
  );

  function updateGrade(id: number, value: string) {
    const grade = value === "" ? null : Number(value);
    setGrades((current) => ({
      ...current,
      [id]: grade === null ? null : Math.max(0, Math.min(100, grade)),
    }));
  }

  async function createExamName() {
    const cleanName = newExamName.trim().replace(/\s+/g, " ");
    if (!cleanName) {
      onToast("Шалгалтын нэрээ бичнэ үү.");
      return false;
    }
    const duplicate = examNames.some(
      (name) => normalizeGradeExamName(name) === normalizeGradeExamName(cleanName),
    );
    if (duplicate) {
      onToast("Ийм шалгалтын нэр өмнө нь бүртгэгдсэн байна.");
      return false;
    }
    try {
      const result = await onCreateExamName(cleanName);
      if (result === false) return false;
      activeExamIdRef.current = undefined;
      setEditingExamId(undefined);
      setTitle(cleanName);
      setExamDate(getDateKey(new Date()));
      setGrades({});
      setNewExamName("");
      return true;
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Шалгалтын нэр хадгалж чадсангүй.");
      return false;
    }
  }

  async function saveStudentGrade(id: number, status: GradeExam["status"]) {
    const cleanTitle = title.trim();
    const grade = grades[id];
    if (!cleanTitle) {
      onToast("Эхлээд шалгалтын нэрээ сонгоно уу.");
      return false;
    }
    if (grade === null || grade === undefined || !Number.isFinite(grade)) {
      onToast("Энэ сурагчийн авсан оноог оруулна уу.");
      return false;
    }

    setSavingStudentId(id);
    try {
      const examId = activeExamIdRef.current ?? editingExamId ?? `exam-${examDate}-${crypto.randomUUID()}`;
      activeExamIdRef.current = examId;
      setEditingExamId(examId);
      const result = await onSaveStudent({
        examId,
        title: cleanTitle,
        date: examDate,
        studentId: id,
        grade,
        status,
      });
      if (result === false) return false;
      setEditingExamId(examId);
      return true;
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Сурагчийн дүн хадгалж чадсангүй.");
      return false;
    } finally {
      setSavingStudentId(null);
    }
  }

  function resetExamForm() {
    activeExamIdRef.current = undefined;
    setEditingExamId(undefined);
    setTitle("");
    setExamDate(getDateKey(new Date()));
    setGrades({});
  }

  function revealExamHistory() {
    setExamHistoryExpanded(true);
    window.requestAnimationFrame(() => {
      examHistorySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function loadExam(exam: GradeExam) {
    activeExamIdRef.current = exam.id;
    setEditingExamId(exam.id);
    setTitle(exam.title);
    setExamDate(exam.date);
    setGrades({ ...exam.grades });
    setViewingExam(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteExam(exam: GradeExam) {
    if (!window.confirm(`“${exam.title}” шалгалтын дүнг устгах уу? Энэ үйлдлийг буцаах боломжгүй.`)) {
      return false;
    }
    try {
      const result = await onDeleteExam(exam.id);
      if (result === false) return false;
      if (editingExamId === exam.id) resetExamForm();
      return true;
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Шалгалтын дүн устгаж чадсангүй.");
      return false;
    }
  }

  if (role === "student") {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Миний шалгалтын дүн</h2>
            <p className="panel-subtitle">Багшийн нийтэлсэн шалгалтын дүн</p>
          </div>
        </div>
        <div className="exam-history-list">
          {studentExams.map((exam) => {
            const grade = studentId === undefined ? undefined : exam.grades[studentId];
            if (grade === null || grade === undefined) return null;
            return (
              <article className="exam-history-row" key={exam.id}>
                <span className="exam-history-icon"><Icon name="grades" size={17} /></span>
                <div className="exam-history-info">
                  <strong>{exam.title}</strong>
                  <span>{formatExamDate(exam.date)}</span>
                </div>
                <span className={`pill ${grade >= 80 ? "green" : "amber"}`}>
                  {grade} / 100 · {gradeLabel(grade)}
                </span>
              </article>
            );
          })}
          {studentExams.length === 0 && (
            <div className="empty-state">Нийтэлсэн дүн одоогоор алга.</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="grades-page">
      <button
        aria-controls="grade-history-list"
        className="exam-history-jump"
        onClick={revealExamHistory}
        type="button"
      >
        <span>Өмнөх шалгалтын дүн рүү очих</span>
        <Icon name="arrow" size={16} />
      </button>

      <section className="panel">
        <div className="panel-header grades-entry-header">
          <input
            aria-label="Сурагч хайх"
            className="search-input"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Сурагч хайх..."
            value={query}
          />
        </div>

        <div className="exam-name-manager">
          <label className="exam-field" htmlFor="new-grade-exam-name">
            <span>Шалгалтын нэр үүсгэх</span>
            <input
              className="form-input"
              id="new-grade-exam-name"
              maxLength={120}
              onChange={(event) => setNewExamName(event.target.value)}
              placeholder="Жишээ: Математикийн шалгалт"
              value={newExamName}
            />
          </label>
          <ProgressButton
            className="secondary-button"
            disabled={savingStudentId !== null}
            loadingLabel="Нэр хадгалж байна"
            onClick={createExamName}
          >
            <Icon name="plus" size={15} /> Нэр үүсгэх
          </ProgressButton>
        </div>

        <div className={`exam-form-fields${editingExamId ? " exam-form-fields-editing" : ""}`}>
          <div className="exam-field">
            <span>Шалгалтын нэр</span>
            <StyledSelect
              ariaLabel="Шалгалтын нэр сонгох"
              className="form-input exam-name-select"
              onChange={setTitle}
              options={[
                { value: "", label: "Шалгалтын нэр сонгох" },
                ...examNames.map((name) => ({ value: name, label: name })),
              ]}
              value={title}
            />
          </div>
          <label className="exam-field">
            <span>Шалгалтын огноо</span>
            <input
              aria-label="Шалгалтын огноо"
              className="date-picker exam-date"
              onChange={(event) => setExamDate(event.target.value)}
              type="date"
              value={examDate}
            />
          </label>
          {editingExamId && (
            <button className="secondary-button exam-reset-button" onClick={resetExamForm}>
              Шинэ шалгалт
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="data-table grades-table">
            <thead>
              <tr><th>Сурагч</th><th>Авсан оноо</th><th>Хадгалах / нийтлэх</th></tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const grade = grades[student.id] ?? null;
                const savedStatus = activeExam && activeExam.grades[student.id] !== null && activeExam.grades[student.id] !== undefined
                  ? getStudentGradeStatus(activeExam, student.id)
                  : undefined;
                return (
                  <tr key={student.id}>
                    <td><StudentIdentity student={student} /></td>
                    <td>
                      <div className="grade-entry">
                        <input
                          aria-label={`${student.name} шалгалтын оноо`}
                          className="grade-input"
                          max={100}
                          min={0}
                          onChange={(event) => updateGrade(student.id, event.target.value)}
                          type="number"
                          value={grade ?? ""}
                        />
                        <span>/ 100</span>
                      </div>
                      {savedStatus && (
                        <span className={`pill grade-saved-status ${savedStatus === "published" ? "green" : "amber"}`}>
                          {savedStatus === "published" ? "Нийтэлсэн" : "Ноорог"}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="grade-student-actions">
                        <ProgressButton
                          aria-label="Ноорог хадгалах"
                          className="secondary-button grade-student-action"
                          disabled={grade === null || !title || savingStudentId !== null}
                          loadingLabel="Хадгалж байна"
                          onClick={() => saveStudentGrade(student.id, "draft")}
                        >
                          <Icon name="file" size={14} />
                          <span className="grade-action-label">Ноорог хадгалах</span>
                        </ProgressButton>
                        <ProgressButton
                          aria-label="Нийтлэх"
                          className="primary-button grade-student-action"
                          disabled={grade === null || !title || savingStudentId !== null}
                          loadingLabel="Нийтэлж байна"
                          onClick={() => saveStudentGrade(student.id, "published")}
                        >
                          <Icon name="check" size={14} />
                          <span className="grade-action-label">Нийтлэх</span>
                        </ProgressButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {students.length === 0 && <div className="empty-state">Сурагч олдсонгүй.</div>}
          {examNames.length === 0 && (
            <div className="empty-state">Эхлээд шалгалтын нэр үүсгээд, жагсаалтаас сонгоно уу.</div>
          )}
        </div>
      </section>

      <section className="panel exam-history-panel" id="grade-history-panel" ref={examHistorySectionRef}>
        <div className="panel-header exam-history-header">
          <div>
            <h2 className="panel-title">
              <button
                aria-controls="grade-history-list"
                aria-expanded={examHistoryExpanded}
                className="exam-history-title-toggle"
                onClick={() => setExamHistoryExpanded((expanded) => !expanded)}
                type="button"
              >
                <span>Өмнөх шалгалтын дүн</span>
                <span className="exam-history-title-chevron"><Icon name="arrow" size={14} /></span>
              </button>
            </h2>
            <p className="panel-subtitle">Шалгалтын нэрээр хайж, үр дүнг харах эсвэл засаж устгана.</p>
          </div>
          {examHistoryExpanded && (
            <div className="exam-history-tools">
              <input
                aria-label="Шалгалтын нэрээр хайх"
                className="search-input exam-history-search"
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="Шалгалтын нэр хайх..."
                value={historyQuery}
              />
              <div className="history-filter">
                <input
                  aria-label="Өмнөх дүнгийн огноо шүүх"
                  className="date-picker history-date"
                  id="grade-history-date"
                  onChange={(event) => setHistoryDate(event.target.value)}
                  type="date"
                  value={historyDate}
                />
                {historyDate && <button className="text-link" onClick={() => setHistoryDate("")}>Бүгд</button>}
              </div>
            </div>
          )}
        </div>
        <div className="exam-history-list" hidden={!examHistoryExpanded} id="grade-history-list">
          {visibleExams.map((exam) => {
            const savedScores = Object.entries(exam.grades).filter(([, score]) => score !== null && score !== undefined);
            const publishedCount = savedScores.filter(([id]) => getStudentGradeStatus(exam, Number(id)) === "published").length;
            const statusLabel = savedScores.length === 0
              ? "Оруулаагүй"
              : publishedCount === savedScores.length
                ? "Нийтэлсэн"
                : publishedCount > 0
                  ? `${publishedCount}/${savedScores.length} нийтэлсэн`
                  : "Ноорог";
            return (
              <article className="exam-history-row" key={exam.id}>
                <div className="exam-history-summary">
                  <span className="exam-history-icon"><Icon name="grades" size={17} /></span>
                  <div className="exam-history-info">
                    <strong>{exam.title}</strong>
                    <span>{formatExamDate(exam.date)} · {savedScores.length} сурагч</span>
                  </div>
                  <button
                    aria-label={`${exam.title} үр дүн харах`}
                    className="icon-button exam-history-action"
                    onClick={() => setViewingExam(exam)}
                    title="Үр дүн"
                  >
                    <Icon name="eye" size={16} />
                  </button>
                </div>
                <div className="exam-history-status-actions">
                  <span className={`pill ${publishedCount ? "green" : "amber"}`}>{statusLabel}</span>
                  <div className="exam-history-actions">
                    <button
                      aria-label={`${exam.title} засах`}
                      className="icon-button exam-history-action"
                      onClick={() => loadExam(exam)}
                      title="Засах"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <ProgressButton
                      aria-label={`${exam.title} устгах`}
                      className="icon-button danger-button exam-history-action"
                      loadingLabel="Устгаж байна"
                      onClick={() => deleteExam(exam)}
                      title="Устгах"
                    >
                      <Icon name="trash" size={15} />
                    </ProgressButton>
                  </div>
                </div>
              </article>
            );
          })}
          {visibleExams.length === 0 && (
            <div className="empty-state">
              {historyQuery || historyDate ? "Хайлтад тохирох шалгалтын дүн олдсонгүй." : "Одоогоор өмнөх шалгалтын дүн алга."}
            </div>
          )}
        </div>
      </section>

      {viewingExam && (
        <ExamResultsDialog exam={viewingExam} students={allStudents} onClose={() => setViewingExam(null)} />
      )}
    </div>
  );
}

function ExamResultsDialog({
  exam,
  students,
  onClose,
}: {
  exam: GradeExam;
  students: Student[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const scoredStudents = students.filter((student) => {
    const hasScore = exam.grades[student.id] !== null && exam.grades[student.id] !== undefined;
    return hasScore && student.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section aria-labelledby="exam-results-title" aria-modal="true" className="modal exam-results-modal" role="dialog">
        <div className="modal-header">
          <div>
            <h2 id="exam-results-title">{exam.title}</h2>
            <p>{formatExamDate(exam.date)} · Оруулсан сурагчдын үр дүн</p>
          </div>
          <button aria-label="Хаах" className="icon-button" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <input
          aria-label="Үр дүнгээс сурагч хайх"
          className="search-input exam-results-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Сурагчийн нэрээр хайх..."
          value={query}
        />
        <div className="exam-results-list">
          {scoredStudents.map((student) => {
            const grade = exam.grades[student.id];
            const status = getStudentGradeStatus(exam, student.id);
            return (
              <div className="exam-result-row" key={student.id}>
                <StudentIdentity student={student} />
                <span className={`pill ${status === "published" ? "green" : "amber"}`}>
                  {status === "published" ? "Нийтэлсэн" : "Ноорог"}
                </span>
                <span className="exam-result-score">{grade} / 100</span>
              </div>
            );
          })}
          {scoredStudents.length === 0 && <div className="empty-state">Оноо оруулсан сурагч олдсонгүй.</div>}
        </div>
      </section>
    </div>
  );
}

function isHomeworkImageFile(fileName: string) {
  return /\.(?:jpe?g|png|webp)$/i.test(fileName);
}

function getHomeworkDownloadUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.hostname === "res.cloudinary.com" &&
      parsedUrl.pathname.includes("/image/upload/") &&
      !parsedUrl.pathname.includes("/fl_attachment/")
    ) {
      parsedUrl.pathname = parsedUrl.pathname.replace(
        "/image/upload/",
        "/image/upload/fl_attachment/",
      );
    }
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function HomeworkView({
  assignments,
  submissions,
  onAddAssignment,
  onAddStudentSubmission,
  onToggleCounted,
  onToast,
  role,
  student,
  sectionToOpen,
  sectionRequest,
  submissionToFocus,
  submissionFocusRequest,
}: {
  assignments: HomeworkAssignment[];
  submissions: HomeworkSubmission[];
  onAddAssignment: (assignment: NewHomeworkAssignment) => Promise<void>;
  onAddStudentSubmission: (
    submission: Omit<HomeworkSubmission, "id" | "submittedAt" | "counted">,
  ) => Promise<unknown>;
  onToggleCounted: (id: string) => Promise<unknown>;
  onToast: (message: string) => void;
  role: UserRole;
  student?: Student;
  sectionToOpen?: HomeworkSection | null;
  sectionRequest?: number;
  submissionToFocus?: string | null;
  submissionFocusRequest?: number;
}) {
  const [activeHomeworkSection, setActiveHomeworkSection] = useState<
    HomeworkSection
  >("received");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState("all");
  const [submissionAssignmentId, setSubmissionAssignmentId] = useState("");
  const [imagePreview, setImagePreview] = useState<{
    url: string;
    name: string;
    downloadUrl: string;
  } | null>(null);
  const imagePreviewCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!imagePreview) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    imagePreviewCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [imagePreview]);

  function openHomeworkImage(url: string, name: string) {
    setImagePreview({ url, name, downloadUrl: getHomeworkDownloadUrl(url) });
  }

  useEffect(() => {
    if (sectionToOpen) setActiveHomeworkSection(sectionToOpen);
  }, [sectionRequest, sectionToOpen]);
  useEffect(() => {
    if (!submissionToFocus) return;
    setActiveHomeworkSection("received");
    setSelectedDate("");
    setSelectedAssignment("all");
    const timer = window.setTimeout(() => {
      document
        .getElementById(`homework-submission-${submissionToFocus}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [submissionFocusRequest, submissionToFocus]);
  const studentSubmissions = submissions.filter(
    (submission) => submission.studentId === student?.id,
  );
  const acceptedSubmissions = submissions.filter(
    (submission) => submission.counted,
  ).length;
  const visibleSubmissions = (role === "student" ? studentSubmissions : submissions).filter((submission) => {
    const matchesDate =
      !selectedDate || submission.submittedAt.slice(0, 10) === selectedDate;
    const matchesAssignment =
      selectedAssignment === "all" ||
      submission.assignmentId === selectedAssignment;
    return matchesDate && matchesAssignment;
  });

  function chooseAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const supportedExtensions = [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "pdf",
      "doc",
      "docx",
      "ppt",
      "pptx",
      "xls",
      "xlsx",
    ];
    if (
      !supportedExtensions.includes(extension) ||
      file.size > 10 * 1024 * 1024
    ) {
      setAttachment(null);
      event.target.value = "";
      onToast("PDF, Word, PowerPoint, Excel эсвэл зураг файл сонгоно уу (10MB хүртэл).");
      return;
    }
    setAttachment(file);
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const selectedAttachment = attachment;
      const upload = selectedAttachment
      ? await uploadHomeworkFile(selectedAttachment, "homework-assignment")
      : undefined;
      const fileAttachment = upload && selectedAttachment
      ? {
          name: selectedAttachment.name,
          resourceType: upload.resourceType,
          url: upload.url,
          publicId: upload.publicId,
        }
      : undefined;

      await onAddAssignment({
      title: title.trim(),
      description: description.trim(),
      dueDate,
      ...(fileAttachment ? { attachment: fileAttachment } : {}),
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      setAttachment(null);
      form.reset();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Даалгавар хадгалж чадсангүй.");
      return false;
    }
    return true;
  }

  async function submitStudentHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const assignment = assignments.find(
      (item) => item.id === submissionAssignmentId,
    );
    if (!student || !assignment || !attachment) {
      onToast("Даалгавраа сонгож, файл хавсаргана уу.");
      return false;
    }

    try {
      const selectedFile = attachment;
      const upload = await uploadHomeworkFile(selectedFile, "homework-submission");
      await onAddStudentSubmission({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        studentId: student.id,
        student: student.name,
        fileName: upload.fileName,
        resourceType: upload.resourceType,
        url: upload.url,
        publicId: upload.publicId,
      });
      setAttachment(null);
      setSubmissionAssignmentId("");
      form.reset();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Даалгавар илгээж чадсангүй.");
      return false;
    }
    return true;
  }

  return (
    <>
      <div aria-label="Гэрийн даалгаврын хэсгүүд" className="homework-tabs" role="tablist">
        <button
          aria-controls="homework-tab-panel"
          aria-selected={activeHomeworkSection === "received"}
          className={`homework-tab ${activeHomeworkSection === "received" ? "active" : ""}`}
          id="homework-tab-received"
          onClick={() => setActiveHomeworkSection("received")}
          role="tab"
          type="button"
        >
          {role === "student" ? "Багшийн даалгавар" : "Ирсэн даалгавар"}
          <span>{role === "student" ? assignments.length : submissions.length}</span>
        </button>
        <button
          aria-controls="homework-tab-panel"
          aria-selected={activeHomeworkSection === "teacher"}
          className={`homework-tab ${activeHomeworkSection === "teacher" ? "active" : ""}`}
          id="homework-tab-teacher"
          onClick={() => setActiveHomeworkSection("teacher")}
          role="tab"
          type="button"
        >
          {role === "student" ? "Миний илгээсэн даалгавар" : "Багшийн даалгавар"}
          <span>{role === "student" ? studentSubmissions.length : assignments.length}</span>
        </button>
        <button
          aria-controls="homework-tab-panel"
          aria-selected={activeHomeworkSection === "send"}
          className={`homework-tab ${activeHomeworkSection === "send" ? "active" : ""}`}
          id="homework-tab-send"
          onClick={() => setActiveHomeworkSection("send")}
          role="tab"
          type="button"
        >
          <Icon name="plus" size={14} /> Даалгавар илгээх
        </button>
      </div>

      <div
        aria-labelledby={`homework-tab-${activeHomeworkSection}`}
        className="homework-tab-panel"
        id="homework-tab-panel"
        role="tabpanel"
      >
        {role === "teacher" && activeHomeworkSection === "received" && (
          <>
            <div className="stats-grid homework-stats">
              <StatCard label="Илгээсэн даалгавар" value={`${submissions.length}`} note="Бүх сурагчийн ирүүлсэн ажил" />
              <StatCard label="Тооцсон" value={`${acceptedSubmissions}`} note="Даалгаварт бүртгэсэн" />
              <StatCard label="Тооцоогүй" value={`${submissions.length - acceptedSubmissions}`} note="Бүртгэлээс хассан" />
            </div>
            <section className="panel">
              <div className="panel-header homework-submission-header">
                <div>
                  <h2 className="panel-title">Сурагчдын илгээсэн даалгавар</h2>
                  <p className="panel-subtitle">
                    {visibleSubmissions.length} илгээмж · {acceptedSubmissions} тооцсон
                  </p>
                </div>
                <div className="homework-filters">
                  <label className="history-filter">
                    <input
                      aria-label="Илгээсэн огноогоор шүүх"
                      className="history-date"
                      onChange={(event) => setSelectedDate(event.target.value)}
                      type="date"
                      value={selectedDate}
                    />
                  </label>
                  <StyledSelect
                    ariaLabel="Даалгавраар шүүх"
                    className="select-input"
                    onChange={setSelectedAssignment}
                    options={[
                      { value: "all", label: "Бүх даалгавар" },
                      ...assignments.map((assignment) => ({
                        value: assignment.id,
                        label: assignment.title,
                      })),
                    ]}
                    value={selectedAssignment}
                  />
                </div>
              </div>
              <div className="homework-submission-list">
                {visibleSubmissions.map((submission) => (
                  <article
                    className={`homework-submission-row ${submissionToFocus === submission.id ? "focused" : ""}`}
                    id={`homework-submission-${submission.id}`}
                    key={submission.id}
                  >
                    <span
                      className={`file-icon ${submission.resourceType === "raw" ? "" : "image"}`}
                    >
                      <Icon name={submission.resourceType === "raw" ? "file" : "image"} size={16} />
                    </span>
                    <div className="homework-submission-copy">
                      <strong>{submission.student}</strong>
                      <span>{submission.assignmentTitle}</span>
                      <small>{submission.fileName}</small>
                    </div>
                    <time
                      className="homework-submission-date"
                      dateTime={submission.submittedAt}
                    >
                      {formatHomeworkDate(submission.submittedAt)}
                    </time>
                    {submission.url ? (
                      isHomeworkImageFile(submission.fileName) ? (
                        <button
                          aria-label={`${submission.student}-ийн зургийг харах`}
                          className="icon-button file-link"
                          onClick={() => openHomeworkImage(submission.url!, submission.fileName)}
                          type="button"
                        >
                          <Icon name="eye" size={15} />
                        </button>
                      ) : (
                        <a
                          aria-label={`${submission.student}-ийн файлыг нээх`}
                          className="icon-button file-link"
                          href={submission.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Icon name="arrow" size={15} />
                        </a>
                      )
                    ) : (
                      <button
                        aria-label={`${submission.student}-ийн файлыг харах`}
                        className="icon-button"
                        onClick={() =>
                          onToast("Жишээ файл тул урьдчилан харах боломжгүй.")
                        }
                        type="button"
                      >
                        <Icon name="arrow" size={15} />
                      </button>
                    )}
                    <ProgressButton
                      aria-pressed={submission.counted}
                      className={`homework-count-toggle ${submission.counted ? "counted" : "not-counted"}`}
                      loadingLabel="Тооцож байна"
                      onClick={() => onToggleCounted(submission.id)}
                      type="button"
                    >
                      {submission.counted ? "Тооцсон · Болих" : "Тооцох"}
                    </ProgressButton>
                  </article>
                ))}
                {visibleSubmissions.length === 0 && (
                  <div className="empty-state">
                    Сонгосон шүүлтэд тохирох сурагчийн даалгавар алга.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {((role === "teacher" && activeHomeworkSection === "teacher") ||
          (role === "student" && activeHomeworkSection === "received")) && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Багшийн явуулсан даалгавар</h2>
                <p className="panel-subtitle">
                  {assignments.length} даалгавар · Илгээсэн болон дуусах хугацаа
                </p>
              </div>
            </div>
            <div className="homework-assignment-list">
              {assignments.map((assignment) => (
                <article className="homework-assignment-card" key={assignment.id}>
                  <span className="homework-assignment-icon">
                    <Icon name="file" size={17} />
                  </span>
                  <div className="homework-assignment-copy">
                    <strong>{assignment.title}</strong>
                    <p>{assignment.description || "Тайлбар оруулаагүй."}</p>
                    <div className="homework-assignment-dates">
                      <span>Илгээсэн: {formatHomeworkDate(assignment.createdAt)}</span>
                      <span>Дуусах: {formatHomeworkDate(assignment.dueDate)}</span>
                    </div>
                  </div>
                  {assignment.attachment ? (
                    assignment.attachment.url ? (
                      isHomeworkImageFile(assignment.attachment.name) ? (
                        <button
                          className="homework-attachment-link"
                          onClick={() => openHomeworkImage(assignment.attachment!.url!, assignment.attachment!.name)}
                          type="button"
                        >
                          <Icon name="image" size={15} />
                          {assignment.attachment.name}
                        </button>
                      ) : (
                        <a
                          className="homework-attachment-link"
                          href={assignment.attachment.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Icon name={assignment.attachment.resourceType === "raw" ? "file" : "image"} size={15} />
                          {assignment.attachment.name}
                        </a>
                      )
                    ) : (
                      <span className="homework-attachment-link">
                        <Icon name={assignment.attachment.resourceType === "raw" ? "file" : "image"} size={15} />
                        {assignment.attachment.name}
                      </span>
                    )
                  ) : (
                    <span className="pill gray">Файлгүй</span>
                  )}
                </article>
              ))}
              {assignments.length === 0 && (
                <div className="empty-state">Багш одоогоор даалгавар оруулаагүй байна.</div>
              )}
            </div>
          </section>
        )}

        {role === "student" && activeHomeworkSection === "teacher" && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Миний илгээсэн даалгавар</h2>
                <p className="panel-subtitle">{studentSubmissions.length} илгээмж</p>
              </div>
            </div>
            <div className="homework-submission-list">
              {studentSubmissions.map((submission) => (
                <article className="homework-submission-row" key={submission.id}>
                  <span className={`file-icon ${submission.resourceType === "raw" ? "" : "image"}`}>
                    <Icon name={submission.resourceType === "raw" ? "file" : "image"} size={16} />
                  </span>
                  <div className="homework-submission-copy">
                    <strong>{submission.assignmentTitle}</strong>
                    <small>{submission.fileName}</small>
                  </div>
                  <time
                    className="homework-submission-date"
                    dateTime={submission.submittedAt}
                  >
                    {formatHomeworkDate(submission.submittedAt)}
                  </time>
                  {submission.url && (
                    isHomeworkImageFile(submission.fileName) ? (
                      <button
                        aria-label="Илгээсэн зургийг харах"
                        className="icon-button file-link"
                        onClick={() => openHomeworkImage(submission.url!, submission.fileName)}
                        type="button"
                      >
                        <Icon name="eye" size={15} />
                      </button>
                    ) : (
                      <a
                        aria-label="Илгээсэн файлыг нээх"
                        className="icon-button file-link"
                        href={submission.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Icon name="arrow" size={15} />
                      </a>
                    )
                  )}
                  <span className={`pill ${submission.counted ? "green" : "gray"}`}>
                    {submission.counted ? "Шалгасан" : "Хүлээгдэж буй"}
                  </span>
                </article>
              ))}
              {studentSubmissions.length === 0 && (
                <div className="empty-state">Та одоогоор даалгавар илгээгээгүй байна.</div>
              )}
            </div>
          </section>
        )}

        {role === "student" && activeHomeworkSection === "send" && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Даалгавар илгээх</h2>
                <p className="panel-subtitle">Багшийн даалгаврыг сонгож, файлаа хавсаргана уу.</p>
              </div>
            </div>
            <ProgressForm className="homework-assignment-form" onSubmit={submitStudentHomework}>
              <div className="homework-field">
                <label htmlFor="homework-assignment-select">Багшийн даалгавар</label>
                <StyledSelect
                  ariaLabel="Багшийн даалгавар сонгох"
                  className="form-input"
                  id="homework-assignment-select"
                  onChange={setSubmissionAssignmentId}
                  options={[
                    { value: "", label: "Даалгавар сонгох" },
                    ...assignments.map((assignment) => ({
                      value: assignment.id,
                      label: assignment.title,
                    })),
                  ]}
                  required
                  value={submissionAssignmentId}
                />
              </div>
              <div className="homework-field">
                <span>Файл хавсаргах</span>
                <label className="homework-file-picker">
                  <Icon name="upload" size={16} />
                  <span>{attachment?.name ?? "Файл сонгох"}</span>
                  <input
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    className="homework-file-input"
                    onChange={chooseAttachment}
                    required
                    type="file"
                  />
                </label>
                <small className="homework-field-hint">PDF, Word, PowerPoint, Excel, зураг · 10MB хүртэл</small>
              </div>
              <div className="homework-submit-row">
                <span>Илгээсэн зураг багшид харагдана.</span>
                <ProgressButton className="primary-button" loadingLabel="Илгээж байна" type="submit">
                  <Icon name="upload" size={15} /> Илгээх
                </ProgressButton>
              </div>
            </ProgressForm>
          </section>
        )}

        {role === "teacher" && activeHomeworkSection === "send" && (
          <section className="panel">
            <div className="panel-header homework-panel-header">
              <div>
                <h2 className="panel-title">Багшийн даалгавар илгээх</h2>
                <p className="panel-subtitle">
                  Даалгаврын нэр, хугацаа болон шаардлагатай бол файл хавсаргана.
                </p>
              </div>
            </div>
            <ProgressForm className="homework-assignment-form" onSubmit={submitAssignment}>
              <label className="homework-field">
                <span>Даалгаврын нэр</span>
                <input
                  className="form-input"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Жишээ: Бутархай тооны бодлого"
                  required
                  value={title}
                />
              </label>
              <label className="homework-field">
                <span>Хүлээн авах хугацаа</span>
                <input
                  className="form-input"
                  onChange={(event) => setDueDate(event.target.value)}
                  required
                  type="date"
                  value={dueDate}
                />
              </label>
              <label className="homework-field homework-description-field">
                <span>Тайлбар, заавар</span>
                <textarea
                  className="form-textarea"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Сурагчдад өгөх заавраа бичнэ үү."
                  value={description}
                />
              </label>
              <div className="homework-field">
                <span>Файл хавсаргах (заавал биш)</span>
                <label className="homework-file-picker">
                  <Icon name="upload" size={16} />
                  <span>{attachment?.name ?? "Файл сонгох"}</span>
                  <input
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    className="homework-file-input"
                    onChange={chooseAttachment}
                    type="file"
                  />
                </label>
                <small className="homework-field-hint">PDF, Word, PowerPoint, Excel, зураг · 10MB хүртэл</small>
              </div>
              <div className="homework-submit-row">
                <span>Шинэ даалгаврыг энэ төхөөрөмжид түр хадгална.</span>
                <ProgressButton className="primary-button" loadingLabel="Хадгалж байна" type="submit">
                  <Icon name="plus" size={15} /> Даалгавар илгээх
                </ProgressButton>
              </div>
            </ProgressForm>
          </section>
        )}
        {imagePreview && (
          <div
            className="homework-image-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) setImagePreview(null);
            }}
          >
            <section
              aria-labelledby="homework-image-title"
              aria-modal="true"
              className="homework-image-dialog"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <header className="homework-image-toolbar">
                <strong className="homework-image-title" id="homework-image-title">
                  {imagePreview.name}
                </strong>
                <div className="homework-image-actions">
                  <a
                    className="primary-button homework-image-download"
                    download={imagePreview.name}
                    href={imagePreview.downloadUrl}
                    rel="noreferrer"
                  >
                    <Icon name="download" size={15} />
                    Татах
                  </a>
                  <button
                    aria-label="Зураг хаах"
                    className="icon-button"
                    onClick={() => setImagePreview(null)}
                    ref={imagePreviewCloseRef}
                    type="button"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </header>
              <div className="homework-image-stage">
                <Image
                  alt={imagePreview.name}
                  className="homework-image-preview"
                  fill
                  sizes="(max-width: 760px) 100vw, 1100px"
                  src={imagePreview.url}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function PaymentsView({
  role,
  query,
  students,
  onQueryChange,
  updateStudent,
  onSendPaymentReminder,
  onToast,
}: {
  role: UserRole;
  query: string;
  students: Student[];
  onQueryChange: (value: string) => void;
  updateStudent: (id: number, patch: Partial<Student>) => Promise<unknown>;
  onSendPaymentReminder: (studentId?: number) => Promise<boolean>;
  onToast: (message: string) => void;
}) {
  const pendingCount = students.filter((student) => student.fee === "Хүлээгдэж буй").length;
  const paidCount = students.filter((student) => student.fee === "Төлсөн").length;
  const partialCount = students.filter((student) => student.fee === "Дутуу төлсөн").length;

  if (role === "student") {
    const student = students[0];
    if (!student) {
      return <div className="empty-state">Сурагчийн бүртгэл олдсонгүй.</div>;
    }

    return (
      <section className="panel student-payment-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Миний төлбөр</h2>
            <p className="panel-subtitle">Төлбөрийн төлөв болон багцын явц</p>
          </div>
        </div>
        <div className="student-payment-summary">
          <div className="student-payment-status">
            <span className="student-payment-label">Төлбөрийн төлөв</span>
            <span className={`pill ${student.fee === "Төлсөн" ? "green" : student.fee === "Дутуу төлсөн" ? "blue" : "amber"}`}>
              {student.fee}
            </span>
          </div>
          <div className="student-package-progress">
            <div className="student-payment-status">
              <span className="student-payment-label">Багцын явц</span>
              <strong>{student.lessonsInPackage} / 12 хичээл</strong>
            </div>
            <div
              aria-label={`Багцын явц ${student.lessonsInPackage} / 12`}
              className="student-package-track"
              role="progressbar"
              aria-valuemax={12}
              aria-valuemin={0}
              aria-valuenow={student.lessonsInPackage}
            >
              <span
                style={{
                  width: `${(student.lessonsInPackage / 12) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
        {student.fee !== "Төлсөн" && (
          <div className="notice-banner">
            <Icon name="bell" size={16} />
            <p>
              {student.fee === "Дутуу төлсөн"
                ? "Багцын төлбөрийн үлдэгдлээ төлнө үү."
                : "Дараагийн хичээлд суухаас өмнө багцын төлбөрөө төлнө үү."}
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <div className="stats-grid payment-stats">
        <StatCard label="Төлбөр хүлээгдэж буй" value={`${pendingCount} сурагч`} note="Төлбөрөө төлөөгүй" />
        <StatCard label="Төлсөн" value={`${paidCount} сурагч`} note="Төлбөр бүрэн төлсөн" />
        <StatCard label="Дутуу төлсөн" value={`${partialCount} сурагч`} note="Төлбөрийн үлдэгдэлтэй" />
      </div>
      <section className="panel">
        <div className="panel-header payment-panel-header">
          <div>
            <h2 className="panel-title">Төлбөрийн төлөв</h2>
            <p className="panel-subtitle">12 удаагийн хичээлийн багцаар тооцно</p>
          </div>
          <div className="payment-header-actions">
            <input
              aria-label="Сурагч хайх"
              className="search-input"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Сурагч хайх..."
              value={query}
            />
            <ProgressButton
              className="secondary-button payment-bulk-reminder"
              loadingLabel="Илгээж байна"
              onClick={() => onSendPaymentReminder()}
            >
              <Icon name="bell" size={15} /> Сануулга илгээх
            </ProgressButton>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table payments-table">
            <thead><tr><th>Сурагч</th><th>Багцын явц</th><th>Төлбөр</th><th>Сануулга</th><th>Үйлдэл</th></tr></thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td><StudentIdentity student={student} /></td>
                  <td>
                    <span className="pill gray">{student.lessonsInPackage} / 12 хичээл</span>
                  </td>
                  <td>
                    <span className={`pill ${student.fee === "Төлсөн" ? "green" : student.fee === "Дутуу төлсөн" ? "blue" : "amber"}`}>
                      {student.fee}
                    </span>
                  </td>
                  <td>
                    {student.fee === "Төлсөн" ? (
                      "—"
                    ) : (
                      <ProgressButton
                        aria-label={`${student.name}-д төлбөрийн сануулга илгээх`}
                        className="icon-button payment-reminder-button"
                        loadingLabel="Илгээж байна"
                        onClick={() => onSendPaymentReminder(student.id)}
                        title={`${student.name}-д сануулга илгээх`}
                      >
                        <Icon name="bell" size={15} />
                      </ProgressButton>
                    )}
                  </td>
                  <td>
                    <div aria-label={`${student.name}-ийн төлбөрийн төлөв тохируулах`} className="payment-status-actions" role="group">
                      {paymentStatusOptions.map((option) => {
                        const selected = student.fee === option.value;
                        return (
                          <ProgressButton
                            aria-pressed={selected}
                            className={`payment-status-choice ${option.tone}${selected ? " selected" : ""}`}
                            disabled={selected}
                            key={option.value}
                            loadingLabel="Хадгалж байна"
                            onClick={async () => {
                              const result = await updateStudent(student.id, {
                                fee: option.value,
                                ...(option.value === "Төлсөн" && student.fee !== "Төлсөн"
                                  ? { lessonsInPackage: 0 }
                                  : {}),
                              });
                              if (result === false) return false;
                              onToast(`${student.name}-ийн төлбөрийн төлөв “${option.label}” боллоо.`);
                              return true;
                            }}
                          >
                            {option.label}
                          </ProgressButton>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="notice-banner payment-policy-notice">
        <Icon name="bell" size={16} />
        <p>12 дахь ирц бүртгэгдэхэд төлбөр нэхэмжлэгдэнэ. Төлбөр төлөх хүртэл сурагчийн дараагийн ирцийг бүртгэх боломжгүй.</p>
      </div>
    </>
  );
}

function AnnouncementView({
  announcements,
  onAddAnnouncement,
  onDeleteAnnouncement,
  onEditAnnouncement,
  role,
}: {
  announcements: Announcement[];
  onAddAnnouncement: () => void;
  onDeleteAnnouncement: (id: string) => Promise<unknown>;
  onEditAnnouncement: (id: string) => void;
  role: UserRole;
}) {
  const [categoryFilter, setCategoryFilter] = useState("Бүгд");
  const [nameQuery, setNameQuery] = useState("");
  const visibleAnnouncements = announcements.filter(
    (announcement) => {
      const matchesCategory =
        categoryFilter === "Бүгд" || announcement.category === categoryFilter;
      const matchesName = announcement.title
        .toLocaleLowerCase("mn-MN")
        .includes(nameQuery.trim().toLocaleLowerCase("mn-MN"));
      return matchesCategory && matchesName;
    },
  );

  return (
    <section className="panel">
      <div className="panel-header announcement-panel-header">
        <div>
          <h2 className="panel-title">Нийтэлсэн мэдээлэл</h2>
          <p className="panel-subtitle">{visibleAnnouncements.length} нийтлэл</p>
        </div>
        <div className="announcement-header-actions">
          <input
            aria-label="Нийтлэлийн нэрээр хайх"
            className="search-input announcement-name-search"
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="Нэрээр нь хайх..."
            type="search"
            value={nameQuery}
          />
          <div className="announcement-filter">
            <label htmlFor="announcement-category-filter">Төрөл</label>
            <StyledSelect
              ariaLabel="Нийтлэлийн төрлөөр шүүх"
              className="select-input"
              id="announcement-category-filter"
              onChange={setCategoryFilter}
              options={[
                { value: "Бүгд", label: "Бүгд" },
                ...announcementCategories.map((category) => ({
                  value: category,
                  label: category,
                })),
              ]}
              value={categoryFilter}
            />
          </div>
          {role === "teacher" && (
            <button className="primary-button" onClick={onAddAnnouncement}>
              <Icon name="plus" size={15} /> Зар нэмэх
            </button>
          )}
        </div>
      </div>
      <div className="announcement-list">
        {visibleAnnouncements.map((announcement) => {
          const linkUrl = safeHttpsUrl(announcement.linkUrl);
          const showFooter = Boolean(linkUrl) || role === "teacher";

          return (
            <article className="announcement-post" key={announcement.id}>
              {announcement.imageUrl && (
                <Image
                  alt={announcement.title}
                  className="announcement-post-image"
                  height={480}
                  unoptimized
                  src={announcement.imageUrl}
                  width={720}
                />
              )}
              <div className="announcement-post-content">
                <div className="announcement-post-meta">
                  <span className="pill green">{announcement.category}</span>
                  <span className="announcement-post-date">
                    <Icon name="calendar" size={13} /> {announcement.date}
                  </span>
                </div>
                <h3>{announcement.title}</h3>
                <p className="announcement-body">{announcement.body}</p>
                {showFooter && (
                  <div
                    className={
                      linkUrl
                        ? "announcement-post-footer"
                        : "announcement-post-footer announcement-post-footer-actions-only"
                    }
                  >
                    {linkUrl && (
                      <a
                        className="announcement-link"
                        href={linkUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        Холбоос нээх <Icon name="arrow" size={14} />
                      </a>
                    )}
                    {role === "teacher" && (
                      <div className="announcement-actions">
                        <button
                          className="announcement-action-button announcement-edit"
                          onClick={() => onEditAnnouncement(announcement.id)}
                          type="button"
                        >
                          <Icon name="edit" size={14} /> <span>Засах</span>
                        </button>
                        <ProgressButton
                          className="announcement-action-button announcement-delete"
                          loadingLabel="Устгаж байна"
                          onClick={() => onDeleteAnnouncement(announcement.id)}
                          type="button"
                        >
                          <Icon name="trash" size={14} /> <span>Устгах</span>
                        </ProgressButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {visibleAnnouncements.length === 0 && (
          <div className="empty-state">
            {announcements.length === 0
              ? "Мэдээлэл хараахан оруулаагүй байна."
              : nameQuery.trim()
                ? "Хайлтад тохирох мэдээлэл алга."
                : "Энэ төрөлд нийтлэл алга."}
          </div>
        )}
      </div>
    </section>
  );
}

function StudentIdentity({ student }: { student: Student }) {
  return (
    <div className="student-profile">
      <ProfileAvatar
        alt=""
        className="avatar"
        src={student.profileImageUrl}
      />
      <div>
        <div className="profile-name">{student.name}</div>
        <div className="student-detail">Сурагчийн эрх</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="stat-card">
      <div className="stat-top">{label}<span className="stat-icon"><Icon name="wallet" size={16} /></span></div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{note}</div>
    </article>
  );
}

function gradeLabel(grade: number) {
  if (grade >= 90) return "Онц";
  if (grade >= 80) return "Сайн";
  if (grade >= 70) return "Дунд";
  return "Сайжруулах";
}
