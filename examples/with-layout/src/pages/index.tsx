import { Card, Col, Row, Statistic } from 'antd'

export default function Dashboard() {
  return (
    <Row gutter={16}>
      <Col span={8}><Card><Statistic title="Users" value={1280} /></Card></Col>
      <Col span={8}><Card><Statistic title="Orders" value={93} /></Card></Col>
      <Col span={8}><Card><Statistic title="Revenue" value={12800} prefix="¥" /></Card></Col>
    </Row>
  )
}
