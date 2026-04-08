import React from 'react'
import { FloatingPanel } from './FloatingPanel'
import { Joystick } from '../controls/Joystick'

export const JoystickFloating: React.FC = () => {
  return (
    <FloatingPanel width={160} glass className="right-3 bottom-3">
      <div className="p-3">
        <Joystick />
      </div>
    </FloatingPanel>
  )
}
