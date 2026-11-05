"""Observe genuine offscreen capture without changing the audio or permission flow."""
import json
import re

PATCH = r"""(() => {
  if (!navigator.mediaDevices || self.__nolaAuditPatched) return;
  self.__nolaAuditPatched=true;
  const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{
    const stream=await get(options);
    self.nolaAudit={settings:stream.getAudioTracks()[0].getSettings(),frames:[]};
    const context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();
    source.connect(analyser);context.resume();
    const data=new Float32Array(analyser.fftSize);
    const timer=setInterval(()=>{
      if(stream.getAudioTracks()[0].readyState==='ended'){clearInterval(timer);context.close();return}
      analyser.getFloatTimeDomainData(data);
      let peak=0,energy=0;for(const value of data){peak=Math.max(peak,Math.abs(value));energy+=value*value}
      self.nolaAudit.frames.push({peak,rms:Math.sqrt(energy/data.length)});
      if(self.nolaAudit.frames.length>300)self.nolaAudit.frames.shift();
    },100);
    return stream;
  };
})()"""


class OffscreenAudit:
    def __init__(self, context, page, identity):
        self.page=page
        self.url=f'chrome-extension://{identity}/offscreen.html'
        self.session=context.browser.new_browser_cdp_session()
        self.target_session=None
        self.responses={}
        self.next_id=1
        self.session.on('Target.receivedMessageFromTarget',self.received)

    def send(self,session_id,method,params=None):
        identity=self.next_id;self.next_id+=1
        self.session.send('Target.sendMessageToTarget',{'sessionId':session_id,'message':json.dumps({'id':identity,'method':method,'params':params or {}})})
        return identity

    def received(self,event):
        message=json.loads(event['message'])
        if 'id' in message:self.responses[message['id']]=message

    def read(self):
        if not self.target_session:
            targets=self.session.send('Target.getTargets',{'filter':[{'exclude':False}]})['targetInfos']
            target=next((item for item in targets if item.get('url')==self.url),None)
            if not target:raise AssertionError('Offscreen capture target was not observed')
            self.target_session=self.session.send('Target.attachToTarget',{'targetId':target['targetId'],'flatten':False})['sessionId']
        identity=self.send(self.target_session,'Runtime.evaluate',{'expression':'self.nolaAudit','returnByValue':True})
        for _ in range(100):
            if identity in self.responses:
                result=self.responses.pop(identity)
                if 'error' in result:raise AssertionError(result['error'])
                return result.get('result',{}).get('result',{}).get('value')
            self.page.wait_for_timeout(50)
        raise AssertionError('Offscreen capture audit timed out')

    def close(self):
        if self.target_session:self.session.send('Target.detachFromTarget',{'sessionId':self.target_session})
        self.session.detach()


def instrument_copy(extension):
    html=(extension / 'offscreen.html').read_text(encoding='utf-8')
    script=re.search(r'<script[^>]+src="([^"]+)"',html).group(1)
    entry=(extension / script.lstrip('/')).resolve()
    assert entry.is_relative_to(extension.resolve())
    entry.write_text(PATCH+';\n'+entry.read_text(encoding='utf-8'),encoding='utf-8')
