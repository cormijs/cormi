import { LikeOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, DatePicker, Pagination, Row, Space, Statistic, Typography } from 'antd'
import { useState } from 'react'

export default function Dashboard() {
  const { message } = App.useApp()
  const [likes, setLikes] = useState(0)
  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2} id="title">Dashboard</Typography.Title>
      <Typography.Paragraph type="secondary">
        Rendered on the server: the styles of these components are extracted into the document,
        so the page is styled before it hydrates.
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="Page views" value={11280} /></Card></Col>
        <Col span={8}><Card><Statistic title="Active users" value={932} /></Card></Col>
        <Col span={8}><Card><Statistic title="Likes" value={likes} prefix={<LikeOutlined />} /></Card></Col>
      </Row>
      <Card title="Components">
        <Space wrap>
          <Button
            type="primary"
            onClick={() => {
              setLikes(likes => likes + 1)
              message.success('Thanks!')
            }}
          >
            Like
          </Button>
          <DatePicker />
          <Pagination defaultCurrent={1} total={50} showSizeChanger={false} />
        </Space>
      </Card>
    </Space>
  )
}
