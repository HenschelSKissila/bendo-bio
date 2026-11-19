import { useParams } from 'react-router-dom'
import { useSettings } from '../../lib/hooks'
import { Card, Spinner } from '../../components/ui'

export default function Legal() {
  const { doc } = useParams()
  const { settings } = useSettings()
  if (!settings) return <Spinner />
  const [title, text] = doc === 'cgv' ? ['Conditions générales de vente', settings.terms]
    : doc === 'confidentialite' ? ['Politique de confidentialité', settings.privacy_policy]
    : ['Mentions légales', settings.legal_notice]
  return (
    <Card className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold text-brand-900">{title}</h1>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{text}</div>
    </Card>
  )
}
