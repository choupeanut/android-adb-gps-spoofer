import React from 'react'
import { CollapsiblePanel } from './CollapsiblePanel'
import { DeviceList } from '../device/DeviceList'

export const DevicePanel: React.FC = () => {
  return (
    <div className="fixed right-5 top-5 w-80 z-10">
      <CollapsiblePanel title="Devices" defaultCollapsed={false} glass>
        <DeviceList />
      </CollapsiblePanel>
    </div>
  )
}
