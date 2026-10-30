export type Student = {
  id: number;
  name: string;
  initials: string;
  phone: string;
  username: string;
  profileImageUrl?: string;
  profileImagePublicId?: string;
  email?: string;
  authUid?: string;
  accountActive: boolean;
  attendance: "Ирсэн" | "Тасалсан" | "Чөлөөтэй" | "Бүртгээгүй";
  lessonsInPackage: number;
  grade: number;
  fee: "Төлсөн" | "Хүлээгдэж буй" | "Дутуу төлсөн";
};

export const navigation = [
  { id: "overview", label: "Хянах самбар", icon: "home" },
  { id: "attendance", label: "Ирц бүртгэл", icon: "calendar" },
  { id: "students", label: "Сурагчид", icon: "users" },
  { id: "grades", label: "Шалгалтын дүн", icon: "grades" },
  { id: "homework", label: "Гэрийн даалгавар", icon: "file" },
  { id: "payments", label: "Төлбөр тооцоо", icon: "wallet" },
  { id: "announcements", label: "Мэдээлэл, зар", icon: "megaphone" },
  { id: "data", label: "Өгөгдөл", icon: "trash" },
] as const;

export type PageId = (typeof navigation)[number]["id"];
export type UserRole = "teacher" | "student";
