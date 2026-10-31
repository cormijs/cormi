import { useCordis } from 'cormi/client'

export default function UsersPage() {
  const { users } = useCordis()
  return (
    <section>
      <h1 id="title">Users</h1>
      <ul id="users">
        {users.list.map(user => <li key={user.id}>{user.name}</li>)}
      </ul>
    </section>
  )
}
