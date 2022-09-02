import { None, Option, Some } from "@sniptt/monads";
import { Options, passwordStrength } from "check-password-strength";
import { gapi } from "gapi-script";
import { I18nKeys } from "i18next";
import { Component, linkEvent } from "inferno";
import { T } from "inferno-i18next-dess";
import {
  CaptchaResponse,
  GetCaptchaResponse,
  GetSiteResponse,
  LoginResponse,
  Register,
  SiteView,
  toUndefined,
  UserOperation,
  wsJsonToRes,
  wsUserOp,
} from "lemmy-js-client";
import { Subscription } from "rxjs";
import { i18n } from "../../i18next";
import { UserService, WebSocketService } from "../../services";
import {
  isBrowser,
  joinLemmyUrl,
  mdToHtml,
  setIsoData,
  toast,
  validEmail,
  wsClient,
  wsSubscribe,
} from "../../utils";
import { HtmlTags } from "../common/html-tags";
import { Icon, Spinner } from "../common/icon";
import { MarkdownTextArea } from "../common/markdown-textarea";

const passwordStrengthOptions: Options<string> = [
  {
    id: 0,
    value: "very_weak",
    minDiversity: 0,
    minLength: 0,
  },
  {
    id: 1,
    value: "weak",
    minDiversity: 2,
    minLength: 10,
  },
  {
    id: 2,
    value: "medium",
    minDiversity: 3,
    minLength: 12,
  },
  {
    id: 3,
    value: "strong",
    minDiversity: 4,
    minLength: 14,
  },
];

interface State {
  registerForm: Register;
  registerLoading: boolean;
  captcha: Option<GetCaptchaResponse>;
  captchaPlaying: boolean;
  siteRes: GetSiteResponse;
}

export class Signup extends Component<any, State> {
  private isoData = setIsoData(this.context);
  private subscription: Subscription;
  private audio: HTMLAudioElement;

  emptyState: State = {
    registerForm: new Register({
      username: undefined,
      password: undefined,
      password_verify: undefined,
      show_nsfw: false,
      captcha_uuid: None,
      captcha_answer: None,
      honeypot: None,
      answer: None,
      email: None,
    }),
    registerLoading: false,
    captcha: None,
    captchaPlaying: false,
    siteRes: this.isoData.site_res,
  };

  constructor(props: any, context: any) {
    super(props, context);

    this.state = this.emptyState;
    this.handleAnswerChange = this.handleAnswerChange.bind(this);

    this.parseMessage = this.parseMessage.bind(this);
    this.subscription = wsSubscribe(this.parseMessage);

    if (isBrowser()) {
      WebSocketService.Instance.send(wsClient.getCaptcha());
    }
  }

  componentWillUnmount() {
    if (isBrowser()) {
      this.subscription.unsubscribe();
    }
  }

  get documentTitle(): string {
    return this.state.siteRes.site_view.match({
      some: siteView => `${this.titleName(siteView)} - ${siteView.site.name}`,
      none: "",
    });
  }

  titleName(siteView: SiteView): string {
    return i18n.t(siteView.site.private_instance ? "apply_to_join" : "sign_up");
  }

  get isLemmyMl(): boolean {
    return isBrowser() && window.location.hostname == "lemmy.ml";
  }

  render() {
    return (
      <div class="container">
        <HtmlTags
          title={this.documentTitle}
          path={this.context.router.route.match.url}
          description={None}
          image={None}
        />
        <div class="row">
          <div class="col-12 col-lg-6 offset-lg-3">{this.registerForm()}</div>
        </div>
      </div>
    );
  }

  registerForm() {
    return this.state.siteRes.site_view.match({
      some: siteView => (
        <form onSubmit={linkEvent(this, this.handleRegisterSubmit)}>
          <h5>{this.titleName(siteView)}</h5>

          {this.isLemmyMl && (
            <div class="form-group row">
              <div class="mt-2 mb-0 alert alert-warning" role="alert">
                <T i18nKey="lemmy_ml_registration_message">
                  #<a href={joinLemmyUrl}>#</a>
                </T>
              </div>
            </div>
          )}

          <div class="form-group row">
            <label class="col-sm-2 col-form-label" htmlFor="register-username">
              {i18n.t("username")}
            </label>

            <div class="col-sm-10">
              <input
                type="text"
                id="register-username"
                class="form-control"
                value={this.state.registerForm.username}
                onInput={linkEvent(this, this.handleRegisterUsernameChange)}
                required
                minLength={3}
                pattern="[a-zA-Z0-9_]+"
                title={i18n.t("community_reqs")}
              />
            </div>
          </div>

          <div class="form-group row">
            <label class="col-sm-2 col-form-label" htmlFor="register-email">
              {i18n.t("email")}
            </label>
            <div class="col-sm-10">
              <input
                type="email"
                id="register-email"
                class="form-control"
                placeholder={
                  siteView.site.require_email_verification
                    ? i18n.t("required")
                    : i18n.t("optional")
                }
                value={toUndefined(this.state.registerForm.email)}
                autoComplete="email"
                onInput={linkEvent(this, this.handleRegisterEmailChange)}
                required={siteView.site.require_email_verification}
                minLength={3}
              />
              {!siteView.site.require_email_verification &&
                !this.state.registerForm.email
                  .map(validEmail)
                  .unwrapOr(true) && (
                  <div class="mt-2 mb-0 alert alert-warning" role="alert">
                    <Icon icon="alert-triangle" classes="icon-inline mr-2" />
                    {i18n.t("no_password_reset")}
                  </div>
                )}
            </div>
          </div>

          <div class="form-group row">
            <label class="col-sm-2 col-form-label" htmlFor="register-password">
              {i18n.t("password")}
            </label>
            <div class="col-sm-10">
              <input
                type="password"
                id="register-password"
                value={this.state.registerForm.password}
                autoComplete="new-password"
                onInput={linkEvent(this, this.handleRegisterPasswordChange)}
                minLength={10}
                maxLength={60}
                class="form-control"
                required
              />
              {this.state.registerForm.password && (
                <div class={this.passwordColorClass}>
                  {i18n.t(this.passwordStrength as I18nKeys)}
                </div>
              )}
            </div>
          </div>

          <div class="form-group row">
            <label
              class="col-sm-2 col-form-label"
              htmlFor="register-verify-password"
            >
              {i18n.t("verify_password")}
            </label>
            <div class="col-sm-10">
              <input
                type="password"
                id="register-verify-password"
                value={this.state.registerForm.password_verify}
                autoComplete="new-password"
                onInput={linkEvent(
                  this,
                  this.handleRegisterPasswordVerifyChange
                )}
                maxLength={60}
                class="form-control"
                required
              />
            </div>
          </div>

          {siteView.site.require_application && (
            <>
              <div class="form-group row">
                <div class="offset-sm-2 col-sm-10">
                  <div class="mt-2 alert alert-warning" role="alert">
                    <Icon icon="alert-triangle" classes="icon-inline mr-2" />
                    {i18n.t("fill_out_application")}
                  </div>
                  {siteView.site.application_question.match({
                    some: question => (
                      <div
                        className="md-div"
                        dangerouslySetInnerHTML={mdToHtml(question)}
                      />
                    ),
                    none: <></>,
                  })}
                </div>
              </div>

              <div class="form-group row">
                <label
                  class="col-sm-2 col-form-label"
                  htmlFor="application_answer"
                >
                  {i18n.t("answer")}
                </label>
                <div class="col-sm-10">
                  <MarkdownTextArea
                    initialContent={None}
                    placeholder={None}
                    buttonTitle={None}
                    maxLength={None}
                    onContentChange={this.handleAnswerChange}
                    hideNavigationWarnings
                  />
                </div>
              </div>
            </>
          )}

          {this.state.captcha.isSome() && (
            <div class="form-group row">
              <label class="col-sm-2" htmlFor="register-captcha">
                <span class="mr-2">{i18n.t("enter_code")}</span>
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick={linkEvent(this, this.handleRegenCaptcha)}
                  aria-label={i18n.t("captcha")}
                >
                  <Icon icon="refresh-cw" classes="icon-refresh-cw" />
                </button>
              </label>
              {this.showCaptcha()}
              <div class="col-sm-6">
                <input
                  type="text"
                  class="form-control"
                  id="register-captcha"
                  value={toUndefined(this.state.registerForm.captcha_answer)}
                  onInput={linkEvent(
                    this,
                    this.handleRegisterCaptchaAnswerChange
                  )}
                  required
                />
              </div>
            </div>
          )}
          {siteView.site.enable_nsfw && (
            <div class="form-group row">
              <div class="col-sm-10">
                <div class="form-check">
                  <input
                    class="form-check-input"
                    id="register-show-nsfw"
                    type="checkbox"
                    checked={this.state.registerForm.show_nsfw}
                    onChange={linkEvent(
                      this,
                      this.handleRegisterShowNsfwChange
                    )}
                  />
                  <label class="form-check-label" htmlFor="register-show-nsfw">
                    {i18n.t("show_nsfw")}
                  </label>
                </div>
              </div>
            </div>
          )}
          <input
            tabIndex={-1}
            autoComplete="false"
            name="a_password"
            type="text"
            class="form-control honeypot"
            id="register-honey"
            value={toUndefined(this.state.registerForm.honeypot)}
            onInput={linkEvent(this, this.handleHoneyPotChange)}
          />

          <div class="form-group row">
            <div class="col-sm-10">
              <button type="submit" class="btn btn-secondary">
                {this.state.registerLoading ? (
                  <Spinner />
                ) : (
                  this.titleName(siteView)
                )}
              </button>
            </div>
          </div>

          <div id="my-signin2">{this.registerGoogle()}</div>
        </form>
      ),
      none: <></>,
    });
  }

  registerGoogle() {
    function onSuccess(googleUser) {
      console.log("Logged in as: " + googleUser.getBasicProfile().getName());
    }
    function onFailure(error) {
      console.log(error);
    }

    return gapi.signin2.render("my-signin2", {
      scope: "profile email",
      width: 240,
      height: 50,
      longtitle: true,
      theme: "dark",
      onsuccess: onSuccess,
      onfailure: onFailure,
    });
  }

  showCaptcha() {
    return this.state.captcha.match({
      some: captcha => (
        <div class="col-sm-4">
          {captcha.ok.match({
            some: res => (
              <>
                <img
                  class="rounded-top img-fluid"
                  src={this.captchaPngSrc(res)}
                  style="border-bottom-right-radius: 0; border-bottom-left-radius: 0;"
                  alt={i18n.t("captcha")}
                />
                {res.wav.isSome() && (
                  <button
                    class="rounded-bottom btn btn-sm btn-secondary btn-block"
                    style="border-top-right-radius: 0; border-top-left-radius: 0;"
                    title={i18n.t("play_captcha_audio")}
                    onClick={linkEvent(this, this.handleCaptchaPlay)}
                    type="button"
                    disabled={this.state.captchaPlaying}
                  >
                    <Icon icon="play" classes="icon-play" />
                  </button>
                )}
              </>
            ),
            none: <></>,
          })}
        </div>
      ),
      none: <></>,
    });
  }

  get passwordStrength() {
    return passwordStrength(
      this.state.registerForm.password,
      passwordStrengthOptions
    ).value;
  }

  get passwordColorClass(): string {
    let strength = this.passwordStrength;

    if (["weak", "medium"].includes(strength)) {
      return "text-warning";
    } else if (strength == "strong") {
      return "text-success";
    } else {
      return "text-danger";
    }
  }

  handleRegisterSubmit(i: Signup, event: any) {
    event.preventDefault();
    i.state.registerLoading = true;
    i.setState(i.state);
    WebSocketService.Instance.send(wsClient.register(i.state.registerForm));
  }

  handleRegisterUsernameChange(i: Signup, event: any) {
    i.state.registerForm.username = event.target.value;
    i.setState(i.state);
  }

  handleRegisterEmailChange(i: Signup, event: any) {
    i.state.registerForm.email = Some(event.target.value);
    if (i.state.registerForm.email.unwrap() == "") {
      i.state.registerForm.email = None;
    }
    i.setState(i.state);
  }

  handleRegisterPasswordChange(i: Signup, event: any) {
    i.state.registerForm.password = event.target.value;
    i.setState(i.state);
  }

  handleRegisterPasswordVerifyChange(i: Signup, event: any) {
    i.state.registerForm.password_verify = event.target.value;
    i.setState(i.state);
  }

  handleRegisterShowNsfwChange(i: Signup, event: any) {
    i.state.registerForm.show_nsfw = event.target.checked;
    i.setState(i.state);
  }

  handleRegisterCaptchaAnswerChange(i: Signup, event: any) {
    i.state.registerForm.captcha_answer = Some(event.target.value);
    i.setState(i.state);
  }

  handleAnswerChange(val: string) {
    this.state.registerForm.answer = Some(val);
    this.setState(this.state);
  }

  handleHoneyPotChange(i: Signup, event: any) {
    i.state.registerForm.honeypot = Some(event.target.value);
    i.setState(i.state);
  }

  handleRegenCaptcha(i: Signup) {
    i.audio = null;
    i.state.captchaPlaying = false;
    i.setState(i.state);
    WebSocketService.Instance.send(wsClient.getCaptcha());
  }

  handleCaptchaPlay(i: Signup) {
    // This was a bad bug, it should only build the new audio on a new file.
    // Replays would stop prematurely if this was rebuilt every time.
    i.state.captcha.match({
      some: captcha =>
        captcha.ok.match({
          some: res => {
            if (i.audio == null) {
              let base64 = `data:audio/wav;base64,${res.wav}`;
              i.audio = new Audio(base64);
            }

            i.audio.play();

            i.state.captchaPlaying = true;
            i.setState(i.state);

            i.audio.addEventListener("ended", () => {
              i.audio.currentTime = 0;
              i.state.captchaPlaying = false;
              i.setState(i.state);
            });
          },
          none: void 0,
        }),
      none: void 0,
    });
  }

  captchaPngSrc(captcha: CaptchaResponse) {
    return `data:image/png;base64,${captcha.png}`;
  }

  parseMessage(msg: any) {
    let op = wsUserOp(msg);
    console.log(msg);
    if (msg.error) {
      toast(i18n.t(msg.error), "danger");
      this.state = this.emptyState;
      this.state.registerForm.captcha_answer = undefined;
      // Refetch another captcha
      // WebSocketService.Instance.send(wsClient.getCaptcha());
      this.setState(this.state);
      return;
    } else {
      if (op == UserOperation.Register) {
        let data = wsJsonToRes<LoginResponse>(msg, LoginResponse);
        this.state = this.emptyState;
        this.setState(this.state);
        // Only log them in if a jwt was set
        if (data.jwt.isSome()) {
          UserService.Instance.login(data);
          this.props.history.push("/communities");
        } else {
          if (data.verify_email_sent) {
            toast(i18n.t("verify_email_sent"));
          }
          if (data.registration_created) {
            toast(i18n.t("registration_application_sent"));
          }
          this.props.history.push("/");
        }
      } else if (op == UserOperation.GetCaptcha) {
        let data = wsJsonToRes<GetCaptchaResponse>(msg, GetCaptchaResponse);
        data.ok.match({
          some: res => {
            this.state.captcha = Some(data);
            this.state.registerForm.captcha_uuid = Some(res.uuid);
            this.setState(this.state);
          },
          none: void 0,
        });
      } else if (op == UserOperation.PasswordReset) {
        toast(i18n.t("reset_password_mail_sent"));
      } else if (op == UserOperation.GetSite) {
        let data = wsJsonToRes<GetSiteResponse>(msg, GetSiteResponse);
        this.state.siteRes = data;
        this.setState(this.state);
      }
    }
  }
}
