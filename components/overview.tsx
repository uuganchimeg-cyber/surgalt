"use client";

import type { AttendanceRecords } from "./attendance-data";
import { formatHomeworkDate, type HomeworkSubmission } from "./homework-data";
import type { Announcement } from "./management-page";
import type { PageId, Student } from "./school-data";
import { Icon } from "./icons";
import { ProgressButton } from "./action-progress";
import { ProfileAvatar } from "./profile-avatar";

export function Overview({
  students,
  attendanceRecords,
  homeworkSubmissions,
  announcements,
  onNavigate,
  onToggleAttendance,
}: {
  students: Student[];
  attendanceRecords: AttendanceRecords;
  homeworkSubmissions: HomeworkSubmission[];
  announcements: Announcement[];
  onNavigate: (page: PageId) => void;
  onToggleAttendance: (id: number) => Promise<unknown>;
}) {
  const presentCount = students.filter((student) => student.attendance === "Ирсэн").length;
  const dueCount = students.filter((student) => student.fee !== "Төлсөн").length;
  const chartData = Object.entries(attendanceRecords)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-7)
    .map(([date, daily]) => {
      const statuses = Object.values(daily ?? {});
      const present = statuses.filter((status) => status === "present").length;
      const absent = statuses.filter((status) => status === "absent").length;
      const recorded = present + absent;
      return {
        date,
        day: new Intl.DateTimeFormat("mn-MN", {
          timeZone: "Asia/Ulaanbaatar",
          weekday: "short",
        }).format(new Date(`${date}T12:00:00`)),
        present: recorded ? Math.round((present / recorded) * 100) : 0,
        absent: recorded ? Math.round((absent / recorded) * 100) : 0,
        presentCount: present,
        recorded,
      };
    });
  const weeklyRecorded = chartData.reduce((sum, day) => sum + day.recorded, 0);
  const weeklyPresent = chartData.reduce(
    (sum, day) => sum + day.presentCount,
    0,
  );
  const weeklyAttendance = weeklyRecorded
    ? Math.round((weeklyPresent / weeklyRecorded) * 100)
    : 0;
  const recentAnnouncements = [...announcements]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 4);
  const recentSubmissions = [...homeworkSubmissions]
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .slice(0, 4);

  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Нийт сурагч"
          value={String(students.length)}
          detail="Бүртгэлтэй сурагч"
          icon="users"
        />
        <StatCard
          label="Өнөөдрийн ирц"
          value={`${presentCount}/${students.length}`}
          detail="Ирцийн бүртгэлээс"
          icon="calendar"
        />
        <StatCard
          label="Илгээсэн даалгавар"
          value={String(homeworkSubmissions.length)}
          detail="Сурагчдын хариу"
          icon="file"
        />
        <StatCard
          label="Төлбөр хүлээгдэж буй"
          value={String(dueCount)}
          detail="Сурагчийн төлөвөөс"
          icon="wallet"
        />
      </div>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Ирцийн тойм</h2>
              <p className="panel-subtitle">Бүртгэсэн сүүлийн өдрүүд</p>
            </div>
            <div className="attendance-summary">
              <div>
                <div className="summary-number">{weeklyAttendance}%</div>
                <div className="summary-caption">Бүртгэлтэй ирц</div>
              </div>
              <button
                aria-label="Ирцийн бүртгэл харах"
                className="icon-button"
                onClick={() => onNavigate("attendance")}
              >
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
          {chartData.length ? (
            <div
              aria-label={`Сүүлийн өдрүүдийн ирцийн харьцаа. Дундаж ирц ${weeklyAttendance} хувь.`}
              className="attendance-chart"
              role="list"
            >
              {chartData.map((item, index) => (
                <div
                  aria-label={`${item.date}: ирсэн ${item.present}%, тасалсан ${item.absent}%, ${item.recorded} бүртгэл`}
                  className={`chart-row${index === chartData.length - 1 ? " latest" : ""}`}
                  key={item.date}
                  role="listitem"
                >
                  <span className="chart-label">
                    <strong>{item.day}</strong>
                    <small>{item.date.slice(-2)}</small>
                  </span>
                  <div aria-hidden="true" className="chart-bar-track">
                    {item.recorded > 0 && (
                      <>
                        <span
                          className="chart-bar-present"
                          style={{ width: `${item.present}%` }}
                        />
                        <span
                          className="chart-bar-absent"
                          style={{ width: `${item.absent}%` }}
                        />
                      </>
                    )}
                  </div>
                  <span className="chart-value">
                    {item.recorded > 0 ? `${item.present}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Ирцийн мэдээлэл бүртгэгдээгүй байна.</div>
          )}
          <div className="chart-legend">
            <span className="legend-item">
              <i className="legend-dot present" /> Ирсэн
            </span>
            <span className="legend-item">
              <i className="legend-dot absent" /> Тасалсан
            </span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Сүүлийн зар</h2>
              <p className="panel-subtitle">Хадгалсан мэдээлэл</p>
            </div>
            <button
              aria-label="Зарын хэсэг нээх"
              className="icon-button"
              onClick={() => onNavigate("announcements")}
            >
              <Icon name="arrow" size={16} />
            </button>
          </div>
          {recentAnnouncements.length ? (
            <div className="schedule-list">
              {recentAnnouncements.map((announcement) => (
                <div className="schedule-item" key={announcement.id}>
                  <span className="schedule-mark" />
                  <div>
                    <div className="schedule-title">{announcement.title}</div>
                    <div className="schedule-caption">
                      {announcement.category} · {announcement.date}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Зар бүртгэгдээгүй байна.</div>
          )}
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Өнөөдрийн ирц</h2>
              <p className="panel-subtitle">Сурагчийн бүртгэлээс</p>
            </div>
            <button
              className="attendance-register-link"
              onClick={() => onNavigate("attendance")}
              type="button"
            >
              <span>Ирц бүртгэх</span>
              <span className="attendance-register-arrow">
                <Icon name="arrow" size={13} />
              </span>
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Сурагч</th>
                  <th>Хичээл</th>
                  <th>Төлөв</th>
                  <th>Бүртгэх</th>
                </tr>
              </thead>
              <tbody>
                {students.slice(0, 4).map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="student-cell">
                        <ProfileAvatar
                          alt=""
                          className="avatar"
                          src={student.profileImageUrl}
                        />
                        {student.name}
                      </div>
                    </td>
                    <td>{student.lessonsInPackage} / 12 хичээл</td>
                    <td>
                      <span className={`pill ${attendanceTone(student.attendance)}`}>
                        {student.attendance}
                      </span>
                    </td>
                    <td>
                      <ProgressButton
                        className={`attendance-button ${student.attendance === "Ирсэн" ? "" : "absent"}`}
                        loadingLabel="Бүртгэж байна"
                        onClick={() => onToggleAttendance(student.id)}
                      >
                        {student.attendance === "Ирсэн" ? "Тасалсан" : "Ирсэн болгох"}
                      </ProgressButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {students.length === 0 && <div className="empty-state">Сурагч бүртгэгдээгүй байна.</div>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Сүүлд ирсэн даалгаврын хариу</h2>
            </div>
            <button
              aria-label="Гэрийн даалгавар харах"
              className="icon-button"
              onClick={() => onNavigate("homework")}
            >
              <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="homework-list">
            {recentSubmissions.map((submission) => (
              <HomeworkItem key={submission.id} submission={submission} />
            ))}
            {recentSubmissions.length === 0 && (
              <div className="empty-state">Даалгаврын хариу бүртгэгдээгүй байна.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function StudentOverview({ student }: { student: Student }) {
  return (
    <div className="stats-grid student-overview-stats">
      <StatCard
        label="Өдрийн ирц"
        value={student.attendance}
        detail="Таны бүртгэгдсэн ирц"
        icon="calendar"
      />
      <StatCard
        label="Төлбөрийн төлөв"
        value={student.fee}
        detail="Таны сургалтын төлбөр"
        icon="wallet"
      />
      <StatCard
        label="Үлдсэн хичээл"
        value={String(student.lessonsInPackage)}
        detail="Багцын үлдэгдэл"
        icon="users"
      />
    </div>
  );
}

function attendanceTone(attendance: Student["attendance"]) {
  if (attendance === "Ирсэн") return "green";
  if (attendance === "Чөлөөтэй") return "amber";
  if (attendance === "Тасалсан") return "red";
  return "gray";
}

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: "users" | "calendar" | "book" | "wallet" | "file";
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        {label}
        <span className="stat-icon">
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{detail}</div>
    </article>
  );
}

function HomeworkItem({ submission }: { submission: HomeworkSubmission }) {
  return (
    <div className="homework-item">
      <span className={`file-icon ${submission.resourceType === "raw" ? "" : "image"}`}>
        <Icon name={submission.resourceType === "raw" ? "file" : "image"} size={17} />
      </span>
      <div className="homework-info">
        <div className="homework-name">{submission.fileName}</div>
        <div className="homework-meta">
          {submission.student} · {formatHomeworkDate(submission.submittedAt)}
        </div>
      </div>
      <span className={`pill ${submission.counted ? "green" : "amber"}`}>
        {submission.counted ? "Бүртгэсэн" : "Шалгаагүй"}
      </span>
    </div>
  );
}
