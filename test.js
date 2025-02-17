import React from "react";

const t = (str) => str; // i18n dummy function

export default function Component(props) {
  const { /* add your props here */ } = props;

  const buTagType = heroImage.usePersonalization == 'yes' && heroImage.metaTagType == 'bu';
  const audienceTagType = heroImage.usePersonalization == 'yes' && heroImage.metaTagType == 'audience-name';
  const endDateCountdown = heroImage.campaignEndDate;
  const ctaTargetWindow = ctaItems.ctaTargetWindow;
  const videoID = heroImage.mediaDescriptionModel.videoID;
  const accountID = heroImage.brightcoveAccountId;
  const youtubeUrl = `https://www.youtube.com/embed/${videoID}`;
  const youtubeTitle = resource['headline/jcr:title'];

  return (
    <>
      
          {(heroImage.variantType == 'icon-block' || heroImage.variantType == 'blog-icon-block') && (<>
          </>)}
          
          
          {(heroImage.variantType) && (<><div className={ `component type-${heroImage.variantType}
          ${iconBlock ? heroImage.textBlockVerticalIconBlockAlign : ''}
          ${iconBlock ? heroImage.textBlockVerticalIconBlockMobileAlign : ''}
          ${iconBlock ? heroImage.iconBlockShape : ''}` } personalization-bu-type={buTagType ? heroImage.buType : ''} personalization-detail-type={buTagType ? heroImage.detailedType : ''} personalization-audience={audienceTagType ? heroImage.audienceName : ''}>
              <div className={ `cmp-container` }>
                  <div className={ `c-hero-banner ${heroImage.textColor} ${heroImage.textColorMobile}
                  ${heroImage.mediaDescriptionModel.mediaTypeItems == 'animation' ? 'c-hero-banner--use-animation' : ''}
                  ${heroImage.textBlockHorizontalAlign}
                  ${!iconBlock ? heroImage.textBlockVerticalAlign : ''}
                  ${heroImage.variantType == 'default' || heroImage.variantType == 'image' || heroImage.variantType == 'promotion' ? heroImage.textBlockVerticalMobileAlign : ''}
                  ${iconBlock ? heroImage.iconBlockVerticalAlign : ''}
                  ${iconBlock ? heroImage.iconBlockHorizontalAlign : ''}` }>
                      
                      <div className={ `c-floating-contents` }>
                          <div className={ `c-floating-contents__floor` }>
                              
                              <div className={ `image c-image c-hero-banner__image` }>
                                  {(heroImage.variantType != 'pdp') && (<><div className={ `cmp-image` }>
                                      {((heroImage.mediaDescriptionModel.mediaTypeItems != 'video' && heroImage.mediaDescriptionModel.mediaTypeItems != 'animation') || heroImage.mediaDescriptionModel.mediaTypeItems == 'image') && (<><picture>
                                          <source media={ `(max-width: 768px)` } srcSet={heroImage.mediaDescriptionModel.imageRefMobile} />
                                          <source media={ `(min-width: 769px)` } srcSet={heroImage.mediaDescriptionModel.imageRef} />
                                          <img className={ `cmp-image__image c-image__img` } src={heroImage.mediaDescriptionModel.imageRefMobile} alt={heroImage.mediaDescriptionModel.imageAltText} loading={ `lazy` } aria-hidden={heroImage.variantType == 'default' ? 'true' : ''} />
                                      </picture></>)}
                                      {(heroImage.mediaDescriptionModel.mediaTypeItems == 'video') && (<><picture>
                                          <source media={ `(max-width: 768px)` } srcSet={heroImage.mediaDescriptionModel.videoThumbnailImageRefMobile} />
                                          <source media={ `(min-width: 769px)` } srcSet={heroImage.mediaDescriptionModel.videoThumbnailImageRef} />
                                          <img className={ `cmp-image__image c-image__img` } src={heroImage.mediaDescriptionModel.videoThumbnailImageRefMobile} alt={heroImage.mediaDescriptionModel.videoThumbnailAltText} loading={ `lazy` } aria-hidden={heroImage.variantType == 'default' ? 'true' : ''} />
                                      </picture></>)}
                                      {(heroImage.mediaDescriptionModel.mediaTypeItems == 'animation') && (<><picture>
                                          <source media={ `(max-width: 768px)` } srcSet={heroImage.mediaDescriptionModel.animationThumbnailImageRefMobile} />
                                          <source media={ `(min-width: 769px)` } srcSet={heroImage.mediaDescriptionModel.animationThumbnailImageRef} />
                                          <img className={ `cmp-image__image c-image__img` } src={heroImage.mediaDescriptionModel.animationThumbnailImageRefMobile} alt={heroImage.mediaDescriptionModel.animationThumbnailAltText} loading={ `lazy` } aria-hidden={heroImage.variantType == 'default' ? 'true' : ''} />
                                      </picture></>)}
                                  </div></>)}
                                  {(heroImage.variantType == 'pdp') && (<><div className={ `cmp-image` }>
                                      {((heroImage.mediaDescriptionModel.mediaTypeItems != 'video' && heroImage.mediaDescriptionModel.mediaTypeItems != 'animation') || heroImage.mediaDescriptionModel.mediaTypeItems == 'image') && (<><picture>
                                          <source media={ `(max-width: 768px)` } data-srcset={heroImage.mediaDescriptionModel.imageRefMobile} className={ `lazyload` } />
                                          <source media={ `(min-width: 769px)` } data-srcset={heroImage.mediaDescriptionModel.imageRef} className={ `lazyload` } />
                                          <img className={ `cmp-image__image c-image__img lazyload` } data-src={heroImage.mediaDescriptionModel.imageRefMobile} alt={heroImage.mediaDescriptionModel.imageAltText} loading={ `lazy` } aria-hidden={heroImage.variantType == 'default' ? 'true' : ''} />
                                      </picture></>)}
                                      {(heroImage.mediaDescriptionModel.mediaTypeItems == 'video') && (<><picture>
                                          <source media={ `(max-width: 768px)` } data-srcset={heroImage.mediaDescriptionModel.videoThumbnailImageRefMobile} className={ `lazyload` } />
                                          <source media={ `(min-width: 769px)` } data-srcset={heroImage.mediaDescriptionModel.videoThumbnailImageRef} className={ `lazyload` } />
                                          <img className={ `cmp-image__image c-image__img lazyload` } data-src={heroImage.mediaDescriptionModel.videoThumbnailImageRefMobile} alt={heroImage.mediaDescriptionModel.videoThumbnailAltText} loading={ `lazy` } aria-hidden={heroImage.variantType == 'default' ? 'true' : ''} />
                                      </picture></>)}
                                      {(heroImage.mediaDescriptionModel.mediaTypeItems == 'animation') && (<><picture>
                                          <source media={ `(max-width: 768px)` } data-srcset={heroImage.mediaDescriptionModel.animationThumbnailImageRefMobile} className={ `lazyload` } />
                                          <source media={ `(min-width: 769px)` } data-srcset={heroImage.mediaDescriptionModel.animationThumbnailImageRef} className={ `lazyload` } />
                                          <img className={ `cmp-image__image c-image__img lazyload` } data-src={heroImage.mediaDescriptionModel.animationThumbnailImageRefMobile} alt={heroImage.mediaDescriptionModel.animationThumbnailAltText} loading={ `lazy` } aria-hidden={heroImage.variantType == 'default' ? 'true' : ''} />
                                      </picture></>)}
                                  </div></>)}
                                  {(heroImage.variantType == 'default') && (<>
                                      <div className={ `img-use__text` }>
                                          <p className={ `sr-only` }>{heroImage.mediaDescriptionModel.imageAltText}</p>
                                      </div>
                                  </>)}
                              </div>
                              {(heroImage.mediaDescriptionModel.mediaTypeItems == 'animation' && heroImage.mediaDescriptionModel.animationRef) && (<><div className={ `c-hero-banner__animation ${heroImage.mediaDescriptionModel.animationMobileFlag=='yes' ? 'use-mobile' : ''}` }>
                                  
                                  <div className={ `c-media` } data-media={ `static` }>
                                      <div className={ `c-media__container` }>
                                          <video className={ `c-media__video js-video mobile-only` } loop={ `` } muted={ `` } playsinline={ `` } preload={ `none` }>
                                              <source src={heroImage.mediaDescriptionModel.animationRefMobile} type={ `video/mp4` } />
                                          </video>
                                          <video className={ `c-media__video js-video desktop-only` } loop={ `` } muted={ `` } playsinline={ `` } preload={ `none` }>
                                              <source src={heroImage.mediaDescriptionModel.animationRef} type={ `video/mp4` } />
                                          </video>
                                          <div className={ `button c-media__controls` }>
                                              <button className={ `cmp-button c-media__button c-media__button--play js-video-play` } type={ `button` } aria-label={ `${t('Play video')} : ${heroImage.mediaDescriptionModel.animationThumbnailAltText}` } disabled={ `` }><span className={ `cmp-button__text c-media__button-text sr-only` }>
                                                      {t('Play video')}</span>
                                              </button>
                                              <button className={ `cmp-button c-media__button c-media__button--pause js-video-pause` } type={ `button` } aria-label={ `${t('Pause video')} : ${heroImage.mediaDescriptionModel.animationThumbnailAltText}` }><span className={ `cmp-button__text c-media__button-text sr-only` }>{t('Pause video')}</span>
                                              </button>
                                              {(heroImage.mediaDescriptionModel.soundDisplayItems=='on') && (<>
                                                  <button className={ `cmp-button c-media__button c-media__button--mute js-video-mute` } type={ `button` } disabled={ `` }><span className={ `cmp-button__text c-media__button-text sr-only` }>
                                                          {t('Mute video')}</span>
                                                  </button>
                                                  <button className={ `cmp-button c-media__button c-media__button--unmute js-video-unmute` } type={ `button` }><span className={ `cmp-button__text c-media__button-text sr-only` }>
                                                          {t('Unmute video')} soundDisplayItems :
                                                          {heroImage.mediaDescriptionModel.soundDisplayItems}</span>
                                                  </button>
                                              </>)}
                                          </div>
                                      </div>
                                  </div>
                              </div></>)}
                          </div>
                          <div className={ `c-floating-contents__floating` }>
                              <div className={ `c-hero-banner__contents` }>
                                  <div className={ `c-floating-contents__main-contents` }>
                                      
                                      <div className={ `c-text-contents ${heroImage.textWidth}` }>
                                          {(heroImage.variantType == 'default' || heroImage.variantType == 'pdp' || heroImage.variantType == 'thin' || heroImage.variantType == 'image' || heroImage.variantType == 'bg-image') && (<>
                                              {/*
      개발자가 컴포넌트를 확인하고 주입해주세요.
      Original: <sly data-sly-resource="${'eyebrow' @resourceType='foo/components/text', decorationTagName='div', cssClassName='c-text-contents__eyebrow font-w-normal-20 font-m-normal-14 title-width'}">
                                              </sly>
      */}
                                          </>)}
                                          {/*
      개발자가 컴포넌트를 확인하고 주입해주세요.
      Original: <sly data-sly-test="${heroImage.variantType}" data-sly-resource="${'headline' @resourceType='foo/components/title', decorationTagName='div', cssClassName='c-text-contents__headline title-width'}">
                                          </sly>
      */}
                                          {(heroImage.scheduleDisplayUsability == 'yes') && (<><div className={ `text c-text-contents__date ${wcmmode.edit ? '' : 'js-date-range'}` } data-start-date={heroImage.startDate} data-end-date={heroImage.endDate} data-campaign-start-date={heroImage.campaignStartDate} data-campaign-end-date={heroImage.campaignEndDate}>
                                              {(heroImage.showDuration) && (<><div className={ `cmp-text font-w-normal-24 font-m-normal-16` }></div></>)}
                                          </div></>)}
                                          {(heroImage.blogDate && (heroImage.variantType == 'blog' || heroImage.variantType == 'blog-icon-block')) && (<><div className={ `text c-text-contents__date` }>
                                              <div className={ `cmp-text font-w-semibold-24 font-m-semibold-16` }>
                                                  {heroImage.blogDateVer2}
                                              </div>
                                          </div></>)}
                                          {/*
      개발자가 컴포넌트를 확인하고 주입해주세요.
      Original: <sly data-sly-test="${heroImage.variantType}" data-sly-resource="${'bodycopy' @resourceType='foo/components/text', decorationTagName='div', cssClassName='c-text-contents__bodycopy font-w-normal-16 font-m-normal-16 title-width'}">
                                          </sly>
      */}
                                          {(heroImage.endDateCountDown && heroImage.scheduleDisplayUsability == 'no') && (<>
                                              
                                          </>)}
                                          {(heroImage.scheduleDisplayUsability == 'yes' && heroImage.showCountdown && heroImage.campaignEndDate) && (<>
                                              
                                          </>)}
                                          {((heroImage.endDateCountDown && heroImage.scheduleDisplayUsability == 'no') || (heroImage.scheduleDisplayUsability == 'yes' && heroImage.showCountdown && heroImage.campaignEndDate)) && (<><div className={ `text c-text-contents__date-countdown c-countdown c-countdown--big` } data-countdown-date={endDateCountDown}>
                                              <div className={ `cmp-text false` }>
                                                  <span className={ `c-countdown__amount-area` }>
                                                      <span className={ `c-countdown__amount days` } aria-label={t('comm_Days')}>00</span>
                                                      <span className={ `c-countdown__amount period` }>
                                                          <span className={ `c-countdown__plural` }>{t('comm_Days')}</span>
                                                          <span className={ `c-countdown__singular` } style={ `display:none;` }>{t('comm_Day')}</span>
                                                      </span>
                                                  </span><span className={ `c-countdown__amount-area` }>
                                                      <span className={ `c-countdown__amount hours` } aria-label={t('comm_Hours')}>00</span>
                                                      <span className={ `c-countdown__amount period` }>
                                                          <span className={ `c-countdown__plural` }>{t('comm_Hours')}</span>
                                                          <span className={ `c-countdown__singular` } style={ `display:none;` }>{t('Hour')}</span>
                                                      </span>
                                                  </span><span className={ `c-countdown__amount-area` }>
                                                      <span className={ `c-countdown__amount minutes` } aria-label={t('comm_Minutes')}>00</span>
                                                      <span className={ `c-countdown__amount period` }>
                                                          <span className={ `c-countdown__plural` }>{t('comm_Minutes')}</span>
                                                          <span className={ `c-countdown__singular` } style={ `display:none;` }>{t('Minute')}</span>
                                                      </span>
                                                  </span><span className={ `c-countdown__amount-area` }>
                                                      <span className={ `c-countdown__amount seconds` } aria-label={t('Seconds')}>00</span>
                                                      <span className={ `c-countdown__amount period` }>
                                                          <span className={ `c-countdown__plural` }>{t('Seconds')}</span>
                                                          <span className={ `c-countdown__singular` } style={ `display:none;` }>{t('Second')}</span>
                                                      </span>
                                                  </span>
                                              </div>
                                          </div></>)}
                                          
                                          {(heroImage.ctaList && (heroImage.variantType == 'default' || heroImage.variantType == 'pdp' || heroImage.variantType == 'thin'|| heroImage.variantType == 'icon-block' || heroImage.variantType == 'image')) && (<><div className={ `button c-cta` }>
                                              
                                              {(heroImage.ctaList).map((ctaItems, index) => (<React.Fragment key={index}>
                                                  
                                                  {(heroImage.ctaType == 'button') && (<>
                                                      {(!ctaTargetWindow) && (<><a className={ `cmp-button ${ctaItems.ctaClassName} c-button c-button--default ${ctaItems.buttonType == 'primary' ? 'highlight' : 'default'} ${ctaItems.externalUrl ? 'icon external-link' : ''} m-small w-medium` } href={ctaItems.ctaUrl} target={ctaItems.ctaTarget}>
                                                          <span className={ `sr-only` }>{resource['headline/jcr:title']}</span>
                                                          <span className={ `cmp-button__text c-button__text` }>{ctaItems.ctaLabel}</span></a></>)}
                                                      {(ctaTargetWindow) && (<><button className={ `cmp-button ${ctaItems.ctaClassName} c-button c-button--default ${ctaItems.buttonType == 'primary' ? 'highlight' : 'default'} ${ctaItems.externalUrl ? 'icon external-link' : ''} m-small w-medium` } onclick={ `window.open('${ctaItems.ctaUrl}','','popup');` }>
                                                          <span className={ `sr-only` }>{resource['headline/jcr:title']}</span>
                                                          <span className={ `cmp-button__text c-button__text` }>{ctaItems.ctaLabel}</span></button></>)}
                                                  </>)}
                                                  {(heroImage.ctaType == 'textlink') && (<>
                                                      {(!ctaTargetWindow) && (<><a className={ `cmp-button ${ctaItems.ctaClassName} c-button c-button--text-icon default transparent m-medium w-medium` } href={ctaItems.ctaUrl} target={ctaItems.ctaTarget}>
                                                          <span className={ `sr-only` }>{resource['headline/jcr:title']}</span>
                                                          <span className={ `cmp-button__text c-button__text` }>{ctaItems.ctaLabel}</span></a></>)}
                                                      {(ctaTargetWindow) && (<><button className={ `cmp-button ${ctaItems.ctaClassName} c-button c-button--text-icon default transparent m-medium w-medium` } onclick={ `window.open('${ctaItems.ctaUrl}','','popup');` }>
                                                          <span className={ `sr-only` }>{resource['headline/jcr:title']}</span>
                                                          <span className={ `cmp-button__text c-button__text` }>{ctaItems.ctaLabel}</span></button></>)}
                                                  </>)}
                                              </React.Fragment>))}
                                          </div></>)}
                                          {(heroImage.mediaDescriptionModel.mediaTypeItems == 'video') && (<><div className={ `button c-media` } data-media={ `dynamic` }>
                                              {(heroImage.mediaDescriptionModel.videoSource=='brightcove') && (<>
                                              </>)}
                                              {(heroImage.mediaDescriptionModel.videoSource=='youtube') && (<>
                                              </>)}
                                              
                                              
                                              
                                              
                                              <button className={ `cmp-button c-action-button c-action-button--watch c-icon js-video-play black w-size24 m-size24` } type={ `button` } data-type={heroImage.mediaDescriptionModel.videoSource} data-video-id={brightcoveVideo ? videoID : ''} data-account-id={brightcoveVideo ? accountID : ''} data-player-id={brightcoveVideo ? 'default' : ''} data-sr-text={t('Close video')} data-src={youtubeVideo ? youtubeUrl : ''} data-title={youtubeVideo ? youtubeTitle : ''}><span className={ `cmp-button__text c-action-button-text` }>{heroImage.mediaDescriptionModel.videoCtaLabel}</span>
                                              </button>
                                          </div></>)}
      
                                          {(heroImage.nuggetTextItems).map((nuggetItems, index) => (<React.Fragment key={index}>{(heroImage.nuggetTextItems && heroImage.variantType == 'pdp' && heroImage.mediaDescriptionModel.mediaTypeItems == 'image') && (<><ul className={ `c-product-nugget` }>
                                              <li className={ `c-product-nugget__item` }>
                                                  <div className={ `text c-product-nugget__eyebrow` }>
                                                      <div className={ `cmp-text font-w-normal-16 font-m-normal-16` }>
                                                          {parse(nuggetItems.nuggetEyebrow)}
                                                      </div>
                                                  </div>
                                                  <div className={ `text c-product-nugget__bodycopy` }>
                                                      <div className={ `cmp-text font-w-normal-16 font-m-normal-16` }>
                                                          {parse(nuggetItems.nuggetBodycopy)}
                                                      </div>
                                                  </div>
                                              </li>
                                          </ul></>)}</React.Fragment>))}
                                      </div>
                                  </div>
                                  {(heroImage.variantType == 'icon-block' || heroImage.variantType == 'blog-icon-block') && (<><div className={ `c-floating-contents__sub-contents` }>
                                      {/*
      개발자가 컴포넌트를 확인하고 주입해주세요.
      Original: <sly data-sly-resource="${'responsive-grid' @resourceType = 'wcm/foundation/components/responsivegrid'}">
                                      </sly>
      */}
                                  </div></>)}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div></>)}
      
      
      
      {(heroImage.mediaDescriptionModel.mediaTypeItems == 'video') && (<>
          {/* 스크립트는 개발자가 직접 확인하고 반영해주세요.
      <script type="application/ld+json">
          ${heroImage.createVideoSchema @ context='unsafe' }
          </script>
      */}
      </>)}
      
      
      {/* config 에서 placeholder 노출 조건은 {!heroImage.variantType}} 입니다.
      <sly data-sly-call="${template.placeholder @ isEmpty=!heroImage.variantType}"></sly>
      */}
    </>
  );
}