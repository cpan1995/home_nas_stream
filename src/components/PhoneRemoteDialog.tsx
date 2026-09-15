import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ActionButton, Modal } from "./Controls";

export function PhoneRemoteDialog({
  loadUrls,
  close,
}: {
  loadUrls: () => Promise<string[]>;
  close: () => void;
}) {
  const { urls, loading } = useRemoteAddresses(loadUrls);
  const [selected, setSelected] = useState(0);
  const url = urls[selected] || urls[0];
  return (
    <Modal title="Phone remote" close={close}>
      <div className="phone-pairing">
        {url ? (
          <>
            <div className="remote-qr">
              <QRCodeSVG
                value={url}
                size={280}
                marginSize={4}
                level="M"
                title="Scan to open the Screening Room remote"
              />
            </div>
            <div>
              <h3>Scan. Sit back. Press play.</h3>
              <p>
                Open your phone’s camera and scan this code. Keep your phone and
                player on the same Wi-Fi or home network.
              </p>
              <p>Swipe to navigate. Tap to select.</p>
              <p className="remote-address">{url}</p>
              {urls.length > 1 && (
                <>
                  <p>If it won’t connect, try another player address:</p>
                  <div className="remote-addresses">
                    {urls.map((address, index) => (
                      <ActionButton
                        key={address}
                        aria-pressed={url === address}
                        onClick={() => setSelected(index)}
                      >
                        {new URL(address).hostname}
                      </ActionButton>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <p>
            {loading
              ? "Finding the player’s network address…"
              : "The phone remote is unavailable. Open the native player with network remote enabled and connect it to your home network."}
          </p>
        )}
      </div>
    </Modal>
  );
}

function useRemoteAddresses(loadUrls: () => Promise<string[]>) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const update = () =>
      loadUrls()
        .then((value) => {
          if (active) {
            setUrls(value);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setUrls([]);
            setLoading(false);
          }
        });
    update();
    const timer = setInterval(update, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadUrls]);
  return { urls, loading };
}

export function PhoneRemoteCorner({
  loadUrls,
  open,
}: {
  loadUrls: () => Promise<string[]>;
  open: () => void;
}) {
  const { urls } = useRemoteAddresses(loadUrls);
  return (
    <button
      className="phone-remote-corner focus-ring"
      aria-label="Phone remote"
      onClick={open}
      title="Scan for phone remote; press to enlarge"
    >
      {urls[0] ? (
        <QRCodeSVG
          value={urls[0]}
          size={156}
          marginSize={4}
          level="M"
          title="Scan for phone remote"
        />
      ) : (
        <span className="remote-unavailable">Remote unavailable</span>
      )}
      <span>Phone remote</span>
    </button>
  );
}
