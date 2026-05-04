import { redirect } from 'next/navigation'

// /login redirects to the employee portal by default
// Clients should use /login/client
export default function LoginPage() {
  redirect('/login/employee')
}
