'use client';

export default function SkylineBackground() {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      className="fixed inset-0 w-full h-full z-0 object-cover"
      src="/VideoLogin.mp4"
    />
  );
}
