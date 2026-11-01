import { Descriptions } from 'antd'
import { useParams } from '@cormi/react/client'

export default function UserDetail() {
  const { id } = useParams()
  return <Descriptions id="user" title={`User ${id}`} items={[{ key: 'id', label: 'ID', children: id }]} />
}
