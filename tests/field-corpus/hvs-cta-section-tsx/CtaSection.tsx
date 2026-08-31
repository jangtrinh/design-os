"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Send, CheckCircle, Phone } from "lucide-react";
import { useLocation } from "@/lib/location-context";
import { CITIES } from "@/lib/locations";
import { submitContactLead } from "@/lib/supabase";

const SERVICE_OPTIONS = {
  "da-lat": [
    { value: "kham-nha", label: "Khám nhà định kỳ" },
    { value: "sua-chua", label: "Sửa chữa cấp tốc" },
  ],
  "hcm": [
    { value: "kham-nha", label: "Khám nhà định kỳ" },
    { value: "quan-ly-ky-thuat", label: "Quản lý kỹ thuật" },
    { value: "sua-chua", label: "Sửa chữa cấp tốc" },
  ],
} as const;

export function CTASection() {
  const { city } = useLocation();
  const cityConfig = CITIES[city];
  const options = SERVICE_OPTIONS[city];
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    service: "kham-nha",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await submitContactLead({
        type: "quick",
        name: formData.name,
        phone: formData.phone,
        service: formData.service,
        location: cityConfig.name,
      });
      setSubmitted(true);
    } catch {
      alert("Gửi thất bại. Vui lòng thử lại hoặc gọi trực tiếp.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="py-24 bg-brand" id="lien-he">
      <div className="max-w-[1440px] mx-auto px-6">
        <ScrollReveal>
          {!submitted ? (
            <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
              {/* Left — Headline + Value Props */}
              <div>
                <span className="font-mono font-bold text-[12px] uppercase tracking-widest text-accent block mb-6">
                  Bắt đầu ngay
                </span>
                <h2 className="font-display font-[900] text-[clamp(2rem,4vw,3.75rem)] uppercase tracking-tight text-white mb-8 leading-[1.1]">
                  Bắt đầu bảo vệ ngôi nhà bạn
                </h2>

                <ul className="space-y-4 mb-10">
                  {[
                    "Miễn phí tư vấn ban đầu",
                    "Không ràng buộc hợp đồng",
                    "Phản hồi trong 2 giờ",
                    "Đội ngũ kỹ sư chuyên nghiệp",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 font-sans text-[16px] text-white/80"
                    >
                      <CheckCircle className="w-5 h-5 text-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="flex items-center gap-3 text-white/60">
                  <Phone className="w-5 h-5" />
                  <span className="font-mono text-[14px]">{cityConfig.phone}</span>
                </div>
              </div>

              {/* Right — Refined Form Card */}
              <div className="bg-white rounded-[24px] p-8 md:p-10 shadow-2xl">
                <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                  {/* Name */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="cta-name" className="text-[12px] font-sans font-[900] uppercase tracking-[0.2em] text-brand-text-muted">
                      Họ và tên khách hàng
                    </label>
                    <input
                      id="cta-name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full border-b-2 border-brand-low py-3 outline-none text-[18px] font-sans font-bold text-brand placeholder:text-brand/40 transition-colors focus:border-accent"
                      placeholder="Nguyễn Văn A"
                    />
                  </div>

                  {/* Phone */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="cta-phone" className="text-[12px] font-sans font-[900] uppercase tracking-[0.2em] text-brand-text-muted">
                      Số điện thoại liên lạc
                    </label>
                    <input
                      id="cta-phone"
                      type="tel"
                      required
                      pattern="[0-9+\s\-]{9,15}"
                      title="Nhập số điện thoại hợp lệ (9-15 ký tự)"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full border-b-2 border-brand-low py-3 outline-none text-[18px] font-sans font-bold text-brand placeholder:text-brand/40 transition-colors focus:border-accent"
                      placeholder="090x xxx xxx"
                    />
                  </div>

                  {/* Service Selection — Radio Pill Labels */}
                  <div className="flex flex-col gap-4">
                    <span className="text-[12px] font-sans font-[900] uppercase tracking-[0.2em] text-brand-text-muted" id="service-group-label">
                      Dịch vụ quan tâm
                    </span>
                    <div className="flex flex-wrap gap-3" role="radiogroup" aria-labelledby="service-group-label">
                      {options.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-3 cursor-pointer px-5 py-3 border rounded-full transition-all ${
                            formData.service === opt.value
                              ? "border-accent bg-brand-muted"
                              : "border-brand-low hover:bg-brand-muted"
                          }`}
                        >
                          <input
                            type="radio"
                            name="service"
                            value={opt.value}
                            checked={formData.service === opt.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                service: e.target.value,
                              })
                            }
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-[14px] font-sans font-[900] uppercase tracking-tight text-brand">
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="group w-full bg-accent text-white py-5 rounded-2xl font-sans font-[900] text-[16px] uppercase tracking-widest transition-all hover:shadow-accent-cta active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Đang gửi..." : <>Gửi yêu cầu ngay <Send className="w-5 h-5" /></>}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* Success State */
            <div className="animate-fade-in-up text-center py-12 max-w-xl mx-auto">
              <CheckCircle className="w-16 h-16 text-accent mx-auto mb-6" />
              <h3 className="font-display font-[900] text-[2rem] uppercase text-white mb-4">
                Cảm ơn bạn!
              </h3>
              <p className="font-sans text-white/80 text-[18px] leading-relaxed">
                Chúng tôi sẽ liên hệ bạn trong vòng 2 giờ.
                <br />
                Doctor House Care — Phòng bệnh hơn chữa bệnh.
              </p>
            </div>
          )}
        </ScrollReveal>
      </div>
    </section>
  );
}
