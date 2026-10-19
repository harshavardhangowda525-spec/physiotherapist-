import { Atmosphere } from "@/components/Atmosphere";
import ChatWindow from "@/components/ChatWindow";
import { BrandMark, IconClock, IconHeart, IconHome, IconPhone, IconPin, IconShield, IconStar } from "@/components/Icons";
import { BUSINESS } from "@/lib/business";

export default function Home() {
  return (
    <>
      <Atmosphere />
      <main className="landing">
        <header className="topbar glass glass--soft">
          <a className="brand" href={BUSINESS.website} rel="noopener">
            <span className="brand-mark">
              <BrandMark size={22} />
            </span>
            <span>
              {BUSINESS.name}
              <small>Jayanagar · Bengaluru</small>
            </span>
          </a>
          <a className="btn btn--primary" href={`tel:${BUSINESS.phoneTel}`}>
            <IconPhone size={16} /> <span>Call {BUSINESS.phoneDisplay}</span>
          </a>
        </header>

        <div className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="dot" /> Home physiotherapy · Bengaluru
            </span>
            <h1>
              Care that comes <em>to your door.</em>
            </h1>
            <p className="lede">
              Tell us what you need and when suits you. Our assistant takes your appointment request in about two minutes —
              then the clinic team calls to confirm availability.
            </p>
            <div className="hero-actions">
              <a className="btn btn--primary" href="#chat">
                Request a home visit
              </a>
              <a className="btn" href={`tel:${BUSINESS.phoneTel}`}>
                <IconPhone size={16} /> {BUSINESS.phoneDisplay}
              </a>
            </div>

            <div className="facts">
              <div className="fact glass glass--soft">
                <span className="fact-icon"><IconHome /></span>
                <div>
                  <h3>Service</h3>
                  <p>Physiotherapy at home<span>Visits confirmed by the clinic</span></p>
                </div>
              </div>
              <div className="fact glass glass--soft">
                <span className="fact-icon"><IconClock /></span>
                <div>
                  <h3>Hours</h3>
                  <p>{BUSINESS.listedHours}<span>Slots confirmed by the clinic</span></p>
                </div>
              </div>
              <div className="fact glass glass--soft">
                <span className="fact-icon"><IconStar /></span>
                <div>
                  <h3>Google rating</h3>
                  <p>5.0 ★ · 49 reviews<span>As listed on Google</span></p>
                </div>
              </div>
              <div className="fact glass glass--soft">
                <span className="fact-icon"><IconPin /></span>
                <div>
                  <h3>Clinic</h3>
                  <p>Yediyur, Jayanagar 6th Block<span>Bengaluru 560082</span></p>
                </div>
              </div>
            </div>

            <div className="trust-strip">
              {BUSINESS.womenOwned && <span><IconHeart size={14} /> Women-owned business</span>}
              <span><IconShield size={14} /> Your details go only to the clinic team</span>
            </div>
          </div>

          <div id="chat">
            <ChatWindow />
          </div>
        </div>

        <footer className="site-footer glass glass--soft">
          <span>{BUSINESS.address}</span>
          <span>
            <a href="/staff">Staff login</a>
          </span>
        </footer>
      </main>
    </>
  );
}
