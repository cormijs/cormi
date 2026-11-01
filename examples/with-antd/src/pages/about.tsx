import { Card, Typography } from 'antd'

export default function About() {
  return (
    <Card>
      <Typography.Title level={3}>About</Typography.Title>
      <Typography.Paragraph>
        <Typography.Text code>@cormijs/plugin-antd</Typography.Text> is a node plugin and a browser plugin.
        The node plugin generates the locale module and registers the browser plugin, which wraps the app
        with <Typography.Text code>ConfigProvider</Typography.Text> and collects the CSS-in-JS styles
        during server rendering.
      </Typography.Paragraph>
      <Typography.Paragraph>
        Change <Typography.Text code>theme</Typography.Text> or <Typography.Text code>locale</Typography.Text> in
        cormi.yml while the dev server runs: only the antd plugin reloads.
      </Typography.Paragraph>
    </Card>
  )
}
