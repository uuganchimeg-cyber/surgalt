import Image from "next/image";

type ProfileAvatarProps = {
  src?: string | null;
  alt?: string;
  className: string;
};

export function ProfileAvatar({ src, alt = "", className }: ProfileAvatarProps) {
  return (
    <Image
      alt={alt}
      className={`${className} profile-avatar-image`}
      height={96}
      onError={(event) => {
        const image = event.currentTarget;
        if (!image.src.endsWith("/profile-avatar.svg")) {
          image.src = "/profile-avatar.svg";
        }
      }}
      src={src || "/profile-avatar.svg"}
      width={96}
    />
  );
}
