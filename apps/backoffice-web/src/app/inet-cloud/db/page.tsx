import { DbBrowserClient } from "./db-browser-client";

export const metadata = {
  title: "INET Cloud DB Viewer | SSTiPOS"
};

export default function InetCloudDbPage() {
  return <DbBrowserClient />;
}
