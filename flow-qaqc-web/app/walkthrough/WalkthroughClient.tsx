'use client'
import { walkthroughCSS, walkthroughBody } from './walkthroughContent'

export default function WalkthroughClient() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@300;400;600;700&display=swap');
        ${walkthroughCSS}
        .walkthrough-page {
          background: #0A1929;
          color: #ffffff;
          font-family: Arial, Helvetica, sans-serif;
        }
      ` }} />
      <div
        className="walkthrough-page"
        dangerouslySetInnerHTML={{ __html: walkthroughBody }}
      />
    </>
  )
}
