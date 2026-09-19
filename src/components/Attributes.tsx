import { ATTRIBUTE_SECTIONS, formatCoordinate, formatValue, label } from '../lib/format'
import type { Observation } from '../lib/types'
import { Field, Pill, Section } from './ui'

const BOOLEAN_COLUMNS = [
  'DryGround',
  'Muddy',
  'StandingWater',
  'SnowIce',
  'RainingSnowing',
  'LeavesOnTrees',
]

export default function Attributes({ observation }: { observation: Observation }) {
  return (
    <>
      {ATTRIBUTE_SECTIONS.map((section) => {
        const present = section.columns.filter((column) => observation[column] !== undefined)
        if (present.length === 0 && section.title !== 'Location') return null

        if (section.title === 'Surface conditions') {
          return (
            <Section key={section.title} title={section.title}>
              <div className="flex flex-wrap gap-1.5">
                {BOOLEAN_COLUMNS.filter((column) => observation[column] !== undefined).map(
                  (column) => {
                    const yes = observation[column] === 'true'
                    return (
                      <Pill key={column} tone={yes ? 'yes' : 'no'}>
                        {yes ? '✓' : '·'} {label(column)}
                      </Pill>
                    )
                  },
                )}
              </div>
            </Section>
          )
        }

        return (
          <Section key={section.title} title={section.title}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {section.title === 'Location' && (
                <div className="col-span-2">
                  <Field
                    label="Coordinates"
                    value={
                      <span className="font-mono text-[12px]">
                        {formatCoordinate(observation.lon, observation.lat)}
                      </span>
                    }
                  />
                </div>
              )}
              {present.map((column) => (
                <Field
                  key={column}
                  label={label(column)}
                  value={formatValue(column, observation[column])}
                />
              ))}
            </dl>
          </Section>
        )
      })}

      {observation.FieldNotes !== undefined && (
        <Section title="Field notes">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
            {String(observation.FieldNotes)}
          </p>
        </Section>
      )}
    </>
  )
}
