import { ConvexProvider, ConvexReactClient } from "convex/react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CrtOverlay, SynthwaveBackdrop } from "./components/Backdrop";
import { BootScreen } from "./screens/BootScreen";
import { AttractScreen } from "./screens/AttractScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { AudioProvider } from "./lib/audio-context";
import { TiltProvider } from "./lib/tilt";
import { ToastProvider } from "./lib/toast";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export default function App() {
  // No Convex deployment configured yet: show the retro setup terminal
  // instead of a white screen (keeps fresh Vercel deploys presentable).
  if (!convex) {
    return (
      <>
        <SynthwaveBackdrop />
        <BootScreen />
        <CrtOverlay />
      </>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <AudioProvider>
        <ToastProvider>
          <TiltProvider>
            <SynthwaveBackdrop />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<AttractScreen />} />
                <Route path="/room/:code" element={<RoomScreen />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
            <CrtOverlay />
          </TiltProvider>
        </ToastProvider>
      </AudioProvider>
    </ConvexProvider>
  );
}
