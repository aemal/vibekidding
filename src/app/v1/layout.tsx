import Link from "next/link";
import { UserProvider } from "@/lib/UserContext";
export default function LegacyLayout({children}:{children:React.ReactNode}) {return <UserProvider archived><aside style={{padding:16,background:"#fff4ce"}}>V1 archive · Legacy data access is disabled until a secure migration is reviewed. <Link href="/">Open the new studio</Link></aside>{children}</UserProvider>}
