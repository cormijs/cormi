import { Card } from 'antd'
import { Link } from 'cormi/client'

const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]

export default function Users() {
  return (
    <Card>
      <ul id="users">
        {users.map(user => <li key={user.id}><Link to={`/users/${user.id}`}>{user.name}</Link></li>)}
      </ul>
    </Card>
  )
}
