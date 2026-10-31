import { Form, Switch } from 'antd'

export default function Settings() {
  return (
    <Form id="settings" layout="vertical">
      <Form.Item label="Notifications"><Switch defaultChecked /></Form.Item>
    </Form>
  )
}
